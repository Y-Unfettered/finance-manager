package app.financemanager.capture.share;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;

import app.financemanager.capture.accessibility.CaptureDedup;
import app.financemanager.capture.accessibility.CapturedPaymentInfo;
import app.financemanager.local.capture.CaptureQueueDao;
import app.financemanager.local.capture.CaptureQueueDatabase;
import app.financemanager.local.capture.CaptureQueueEntity;
import app.financemanager.local.PaymentCapturePlugin;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PaymentShareActivity extends Activity {

    private static final String TAG = "PaymentShare";
    public static final String PARSER_VERSION = "0.1.0";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdown();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = getIntent();
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            if (type.startsWith("text/")) {
                handleTextShare(intent.getStringExtra(Intent.EXTRA_TEXT));
            } else if (type.startsWith("image/")) {
                Uri imageUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (imageUri != null) {
                    handleImageShare(imageUri);
                } else {
                    Toast.makeText(this, "无法读取分享图片", Toast.LENGTH_SHORT).show();
                    finish();
                }
            } else {
                Toast.makeText(this, "不支持的分享类型", Toast.LENGTH_SHORT).show();
                finish();
            }
        } else {
            Toast.makeText(this, "无效的分享数据", Toast.LENGTH_SHORT).show();
            finish();
        }
    }

    private void handleTextShare(String text) {
        if (text == null || text.isEmpty()) {
            finish();
            return;
        }

        Log.d(TAG, "handleTextShare: " + text.substring(0, Math.min(text.length(), 100)));

        CapturedPaymentInfo info = parseText(text);
        if (info == null) {
            Toast.makeText(this, "未能识别到支付信息", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        // ⚠️ Room 未开 allowMainThreadQueries，主线程写库必然抛 IllegalStateException
        // （onCreate 运行在主线程）。移入后台线程，按真实结果提示并关闭。
        executor.execute(() -> {
            final boolean ok = writeCaptured(info, "share_text", "分享文本");
            runOnUiThread(() -> {
                Toast.makeText(this,
                        ok ? "已识别到支付信息，即将打开私人记账" : "保存失败，请重试",
                        Toast.LENGTH_SHORT).show();
                finish();
            });
        });
    }

    private void handleImageShare(Uri imageUri) {
        Toast.makeText(this, "正在识别图片...", Toast.LENGTH_SHORT).show();

        executor.execute(() -> {
            OfflineOCR ocr = null;
            try {
                // 使用 PP-OCR（NCNN 离线推理）替代 ML Kit
                // 小米澎湃 OS 无 Google Play Services，ML Kit 不可用
                ocr = OfflineOCR.create(PaymentShareActivity.this.getApplicationContext());
                if (ocr == null) {
                    throw new RuntimeException("OCR 引擎初始化失败，请确认模型文件已正确打包");
                }

                // 将 content:// URI 转为 Bitmap
                android.graphics.Bitmap bitmap = null;
                try {
                    bitmap = android.provider.MediaStore.Images.Media
                            .getBitmap(PaymentShareActivity.this.getContentResolver(), imageUri);
                } catch (Exception e) {
                    throw new RuntimeException("无法读取分享图片: " + imageUri, e);
                }

                if (bitmap == null || bitmap.isRecycled()) {
                    throw new RuntimeException("图片解码失败");
                }

                String fullText = ocr.recognize(bitmap);
                if (bitmap != null) {
                    bitmap.recycle();
                }

                if (fullText == null || fullText.isEmpty()) {
                    runOnUiThread(() -> {
                        Toast.makeText(this, "图片中未识别到文字", Toast.LENGTH_SHORT).show();
                        finish();
                    });
                    return;
                }

                Log.d(TAG, "OCR result: " + fullText.substring(0, Math.min(fullText.length(), 200)));

                CapturedPaymentInfo info = parseText(fullText);
                if (info == null) {
                    runOnUiThread(() -> {
                        Toast.makeText(this, "未能从图片中识别到支付信息", Toast.LENGTH_SHORT).show();
                        finish();
                    });
                    return;
                }

                writeCaptured(info, "share_ocr", "分享图片-OCR");
                runOnUiThread(() -> {
                    Toast.makeText(this, "OCR 识别成功，即将打开财务经理", Toast.LENGTH_SHORT).show();
                    finish();
                });

            } catch (Exception e) {
                Log.w(TAG, "OCR failed", e);
                runOnUiThread(() -> {
                    Toast.makeText(this, "图片识别失败: " + e.getMessage(), Toast.LENGTH_LONG).show();
                    finish();
                });
            } finally {
                if (ocr != null) {
                    ocr.release();
                }
            }
        });
    }

    private CapturedPaymentInfo parseText(String text) {
        if (text == null || text.isEmpty()) return null;

        Log.d(TAG, "parseText full: " + text.substring(0, Math.min(text.length(), 300)));

        CapturedPaymentInfo info = new CapturedPaymentInfo();
        info.setConfidence("medium");

        // ---- 金额提取（多格式、宽松匹配）----
        // 策略：优先 ¥/￥/元 + 数字，其次纯数字。允许千分位逗号。
        String amountStr = null;
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("[¥￥]\\s*([\\d,]+(?:\\.\\d+)?)").matcher(text);
        if (m.find()) {
            amountStr = m.group(1).replace(",", "");
        } else {
            // 匹配 "数字 元"
            m = java.util.regex.Pattern
                    .compile("([\\d,]+(?:\\.\\d+)?)\\s*元").matcher(text);
            if (m.find()) {
                amountStr = m.group(1).replace(",", "");
            } else {
                // 兜底：整段文本中查找最长的数字串（排除订单号/手机号等过长数字）
                m = java.util.regex.Pattern
                        .compile("\\b(\\d{1,6}(?:\\.\\d{1,2})?)\\b").matcher(text);
                String bestMatch = null;
                int bestLength = 0;
                while (m.find()) {
                    String candidate = m.group(1);
                    if (candidate.length() > bestLength) {
                        bestLength = candidate.length();
                        bestMatch = candidate;
                    }
                }
                amountStr = bestMatch;
            }
        }
        if (amountStr != null) {
            info.setAmount(amountStr);
            info.setAmountMinor(CapturedPaymentInfo.parseAmountMinor(amountStr));
            Log.d(TAG, "amount: " + amountStr + " minor=" + info.getAmountMinor());
        } else {
            Log.d(TAG, "no amount found");
        }

        java.util.regex.Matcher mm = java.util.regex.Pattern
                .compile("(?:商家|商户|收款方|商家名称)[:：]?\\s*([^\\n\\r]+)")
                .matcher(text);
        if (mm.find()) {
            info.setMerchant(mm.group(1).trim());
            Log.d(TAG, "merchant: " + info.getMerchant());
        }

        java.util.regex.Matcher ma = java.util.regex.Pattern
                .compile("(?:付款账户|支付账户|账户|付款方式)[:：]?\\s*([^\\n\\r]+)")
                .matcher(text);
        if (ma.find()) info.setAccountHint(ma.group(1).trim());

        java.util.regex.Matcher mo = java.util.regex.Pattern
                .compile("(?:订单号|交易号|商户单号)[:：]?\\s*(\\S+)")
                .matcher(text);
        if (mo.find()) info.setOrderNo(mo.group(1).trim());

        boolean hasAmount = info.isHasAmount();
        Log.d(TAG, "hasAmount=" + hasAmount);
        return hasAmount ? info : null;
    }

    /** 写入捕获队列。返回是否成功；调用方据此提示（不得在主线程调用）。 */
    private boolean writeCaptured(CapturedPaymentInfo info, String captureMethod, String sourceName) {
        try {
            if (CaptureDedup.hasSeen(info.getSourcePackage(), info.getAmountMinor())) {
                Log.d(TAG, "dedup skipped: " + info.getSourcePackage());
                return false;
            }

            CaptureQueueDao dao = CaptureQueueDatabase
                    .getInstance(this.getApplicationContext())
                    .captureQueueDao();

            CaptureQueueEntity entity = new CaptureQueueEntity();
            entity.setSourcePackage(info.getSourcePackage() != null ? info.getSourcePackage() : "share");
            entity.setSourceName(sourceName);
            entity.setCaptureMethod(captureMethod);
            entity.setOccurredAt(CapturedPaymentInfo.nowUtcIso());
            entity.setAmountMinor(info.getAmountMinor() != null ? info.getAmountMinor() : 0L);
            entity.setCurrency("CNY");
            entity.setMerchant(info.getMerchant());
            entity.setAccountHint(info.getAccountHint());
            entity.setSourceOrderId(info.getOrderNo());
            entity.setRawFingerprint(buildFingerprint(info, captureMethod));
            entity.setConfidence(parseConfidence(info.getConfidence()));
            entity.setParserVersion(PARSER_VERSION);
            entity.setStatus("pending");
            entity.setCreatedAt(System.currentTimeMillis());

            dao.insert(entity);
            // 落库成功后才标记内存去重：插入失败时用户可立即重试
            // （原实现先标记后写库，失败后 2 分钟内重试也会被拦）
            CaptureDedup.markSeen(info.getSourcePackage(), info.getAmountMinor());
            PaymentCapturePlugin.notifyCandidate(entity);
            Log.d(TAG, "share written: " + info.getAmount());
            return true;
        } catch (Exception e) {
            Log.w(TAG, "write failed", e);
            return false;
        }
    }

    private static String buildFingerprint(CapturedPaymentInfo info, String method) {
        String rawPkg = info.getSourcePackage() != null ? info.getSourcePackage() : "share";
        String rawAmt = info.getAmountMinor() != null ? String.valueOf(info.getAmountMinor()) : "0";
        String rawMerchant = info.getMerchant() != null ? info.getMerchant() : "";
        // 分钟级时间桶：同一笔支付的重复分享在 1 分钟窗口内指纹一致，能被 capture_fingerprint
        // 持久拦截。⚠️ 绝不能掺入随机数——那会让每次指纹都不同，持久去重层完全失效。
        return rawPkg + ":" + method + ":" + rawAmt + ":" + rawMerchant + ":"
                + (System.currentTimeMillis() / 60000L);
    }

    private static float parseConfidence(String level) {
        switch (level) {
            case "high": return 1.0f;
            case "medium": return 0.7f;
            case "low": return 0.4f;
            default: return 0.5f;
        }
    }
}
