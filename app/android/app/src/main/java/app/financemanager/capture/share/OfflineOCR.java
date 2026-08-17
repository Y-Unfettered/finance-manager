package app.financemanager.capture.share;

import android.content.Context;
import android.graphics.Bitmap;
import android.util.Log;

import com.equationl.ncnnandroidppocr.OCR;
import com.equationl.ncnnandroidppocr.bean.Device;
import com.equationl.ncnnandroidppocr.bean.DrawModel;
import com.equationl.ncnnandroidppocr.bean.ImageSize;
import com.equationl.ncnnandroidppocr.bean.ModelType;

/**
 * PP-OCR v5 离线 OCR 封装。
 *
 * 底层使用 paddleocr4android（NCNN 推理引擎），不依赖 Google Play Services。
 * 小米澎湃 OS 中国版无 Google Play Services，ML Kit 完全不可用，改用此方案。
 *
 * 模型文件位于 assets 目录：
 *   PP_OCRv5_mobile_det.ncnn.param / .ncnn.bin
 *   PP_OCRv5_mobile_rec.ncnn.param / .ncnn.bin
 *
 * 用法：
 *   OfflineOCR ocr = OfflineOCR.create(context);
 *   String text = ocr.recognize(bitmap);
 *   ocr.release();
 */
public class OfflineOCR {

    private static final String TAG = "OfflineOCR";

    private final OCR ocr;

    private OfflineOCR(OCR ocr) {
        this.ocr = ocr;
    }

    /**
     * 创建 OfflineOCR 实例，加载 PP-OCR v5 Mobile 模型（CPU 推理）。
     *
     * @param context 任意 Context
     * @return OfflineOCR 实例，若模型加载失败则返回 null
     */
    public static OfflineOCR create(Context context) {
        if (context == null) {
            Log.e(TAG, "create: context is null");
            return null;
        }

        OCR engine;
        try {
            engine = new OCR();
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "PP-OCR native 库加载失败（设备架构不兼容或库损坏），无法使用 OCR", e);
            return null;
        }

        try {
            boolean ok = engine.initModelFromAssert(
                    context.getAssets(),
                    ModelType.Mobile,
                    ImageSize.Size720,
                    Device.CPU
            );

            if (ok) {
                Log.d(TAG, "PP-OCR v5 模型加载成功 (Mobile, 720px, CPU)");
                return new OfflineOCR(engine);
            } else {
                engine.release();
                Log.e(TAG, "PP-OCR v5 模型加载失败，请确认 assets 中存在 det/rec .param 和 .ncnn.bin 文件");
                return null;
            }
        } catch (Exception e) {
            Log.e(TAG, "PP-OCR 初始化异常", e);
            try { engine.release(); } catch (Exception ignored) {}
            return null;
        }
    }

    /**
     * 对图片执行 OCR 识别。
     *
     * @param bitmap 待识别图片
     * @return 识别到的文字（按行拼接），无结果时返回空字符串
     * @throws IllegalStateException 如果模型未正确初始化
     */
    public String recognize(Bitmap bitmap) {
        if (ocr == null) {
            throw new IllegalStateException("OCR not initialized");
        }
        if (bitmap == null || bitmap.isRecycled()) {
            Log.w(TAG, "recognize: bitmap is null or recycled");
            return "";
        }

        Log.d(TAG, "recognize: input " + bitmap.getWidth() + "x" + bitmap.getHeight());

        try {
            var result = ocr.detectBitmap(bitmap, DrawModel.None);
            if (result == null) {
                Log.w(TAG, "recognize: detectBitmap returned null");
                return "";
            }
            String text = result.getText();
            if (text != null && !text.isEmpty()) {
                Log.d(TAG, "recognize: success, lines=" + result.getTextLines().size()
                        + ", inferenceTime=" + result.getInferenceTime() + "ms");
            }
            return text != null ? text : "";
        } catch (Exception e) {
            Log.e(TAG, "recognize: 异常", e);
            return "";
        }
    }

    /** 释放 OCR 引擎的 native 资源。可重复调用。 */
    public void release() {
        if (ocr != null) {
            ocr.release();
        }
    }
}
