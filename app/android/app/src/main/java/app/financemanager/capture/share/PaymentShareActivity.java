package app.financemanager.capture.share;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;

import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

import app.financemanager.capture.accessibility.CaptureDedup;
import app.financemanager.capture.accessibility.CapturedPaymentInfo;
import app.financemanager.local.capture.CaptureQueueDao;
import app.financemanager.local.capture.CaptureQueueDatabase;
import app.financemanager.local.capture.CaptureQueueEntity;

import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class PaymentShareActivity extends Activity {

    private static final String TAG = "PaymentShare";
    public static final String PARSER_VERSION = "0.1.0";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

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

        writeCaptured(info, "share_text", "分享文本");
        Toast.makeText(this, "已识别到支付信息，即将打开财务经理", Toast.LENGTH_SHORT).show();
        finish();
    }

    private void handleImageShare(Uri imageUri) {
        Toast.makeText(this, "正在识别图片...", Toast.LENGTH_SHORT).show();

        executor.execute(() -> {
            TextRecognizer recognizer = null;
            try {
                recognizer = TextRecognition.getClient(
                        new ChineseTextRecognizerOptions.Builder().build());

                // 分享截图通常是 content:// URI，fromFilePath 读不出；先转 Bitmap 再创建 InputImage
                InputImage image;
                try {
                    android.graphics.Bitmap bitmap = android.provider.MediaStore.Images.Media
                            .getBitmap(PaymentShareActivity.this.getContentResolver(), imageUri);
                    image = InputImage.fromBitmap(bitmap, 0);
                    if (bitmap != null) bitmap.recycle();
                } catch (Exception e) {
                    throw new RuntimeException("无法读取分享图片: " + imageUri, e);
                }
                Task<Text> task = recognizer.process(image);
                Text result = Tasks.await(task, 15, TimeUnit.SECONDS);

                String fullText = result.getText();
                Log.d(TAG, "OCR result: " + fullText.substring(0, Math.min(fullText.length(), 200)));

                if (fullText.isEmpty()) {
                    runOnUiThread(() -> {
                        Toast.makeText(this, "图片中未识别到文字", Toast.LENGTH_SHORT).show();
                        finish();
                    });
                    return;
                }

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
                if (recognizer != null) {
                    recognizer.close();
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

    private void writeCaptured(CapturedPaymentInfo info, String captureMethod, String sourceName) {
        try {
            if (CaptureDedup.isDuplicate(info.getSourcePackage(), info.getAmountMinor())) {
                Log.d(TAG, "dedup skipped: " + info.getSourcePackage());
                return;
            }

            CaptureQueueDao dao = CaptureQueueDatabase
                    .getInstance(this.getApplicationContext())
                    .captureQueueDao();

            CaptureQueueEntity entity = new CaptureQueueEntity();
            entity.setSourcePackage(info.getSourcePackage() != null ? info.getSourcePackage() : "share");
            entity.setSourceName(sourceName);
            entity.setCaptureMethod(captureMethod);
            entity.setOccurredAt(java.time.Instant.now().toString());
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
            Log.d(TAG, "share written: " + info.getAmount());
        } catch (Exception e) {
            Log.w(TAG, "write failed", e);
        }
    }

    private static String buildFingerprint(CapturedPaymentInfo info, String method) {
        String rawPkg = info.getSourcePackage() != null ? info.getSourcePackage() : "share";
        String rawAmt = info.getAmountMinor() != null ? String.valueOf(info.getAmountMinor()) : "0";
        String rawMerchant = info.getMerchant() != null ? info.getMerchant() : "";
        return rawPkg + ":" + method + ":" + rawAmt + ":" + rawMerchant + ":" + randomToken();
    }

    private static String randomToken() {
        Random r = new Random(System.nanoTime());
        byte[] bytes = new byte[4];
        r.nextBytes(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xff));
        }
        return sb.toString();
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