package app.financemanager.local;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.text.TextUtils;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 剪贴板读取插件。
 *
 * 解决 Web 层 navigator.clipboard.readText() 在 Android WebView 不可靠的问题。
 * 直接调用原生 ClipboardManager，无权限限制。
 *
 * 同时在 handleOnResume() 里检测剪贴板内容变化：app 切回前台时，如果剪贴板里
 * 是看起来像交易 JSON 数组的内容（且与上次不同），通过 notifyListeners 推事件给
 * WebView，由前端弹全局确认弹窗。
 */
@CapacitorPlugin(name = "ClipboardReader")
public class ClipboardReaderPlugin extends Plugin {

    private static final String TAG = "ClipboardReader";

    /** 上次 onResume 时看到的剪贴板内容，用于去重，避免同一内容反复弹窗。 */
    private String lastSeenContent = "";

    /** 用户已确认或忽略的内容，本次内容不再弹窗（直到内容再次变化）。 */
    private String consumedContent = "";

    /**
     * 立即读取剪贴板文本。
     * 返回 { value: string, hasContent: boolean }。
     */
    @PluginMethod
    public void getText(PluginCall call) {
        JSObject ret = readClipboard();
        Log.d(TAG, "getText() -> hasContent=" + ret.getBoolean("hasContent", false)
                + " length=" + (ret.getString("value") == null ? 0 : ret.getString("value").length()));
        call.resolve(ret);
    }

    /**
     * 标记当前剪贴板内容为已处理，后续 onResume 不再为同一内容弹窗。
     * 用户点「立即导入」或「暂不导入」后由前端调用。
     */
    @PluginMethod
    public void markConsumed(PluginCall call) {
        String current = readClipboard().getString("value");
        if (current != null) {
            consumedContent = current;
            lastSeenContent = current;
            Log.d(TAG, "markConsumed() -> length=" + current.length() + " head=" + head(current, 60));
        } else {
            Log.d(TAG, "markConsumed() -> 当前剪贴板为空");
        }
        call.resolve();
    }

    /**
     * App 切回前台时由 Bridge 自动调用。
     * 读取剪贴板，如果内容变化且看起来像交易 JSON，推事件给前端。
     */
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        Log.d(TAG, "======== handleOnResume() ========");
        JSObject result = readClipboard();
        String value = result.getString("value");
        boolean hasContent = result.getBoolean("hasContent", false);
        Log.d(TAG, "handleOnResume: hasContent=" + hasContent
                + " length=" + (value == null ? 0 : value.length())
                + " head=" + head(value, 80));

        if (!hasContent || TextUtils.isEmpty(value)) {
            Log.d(TAG, "handleOnResume: 剪贴板为空 -> 跳过");
            return;
        }

        boolean sameAsLastSeen = value.equals(lastSeenContent);
        boolean sameAsConsumed = value.equals(consumedContent);
        Log.d(TAG, "handleOnResume: sameAsLastSeen=" + sameAsLastSeen + " sameAsConsumed=" + sameAsConsumed);

        // 内容没变，不重复弹
        if (sameAsLastSeen) {
            Log.d(TAG, "handleOnResume: 内容未变化 (sameAsLastSeen) -> 跳过");
            return;
        }
        lastSeenContent = value;

        // 已被用户处理过的内容，不再弹
        if (sameAsConsumed) {
            Log.d(TAG, "handleOnResume: 已被标记为已处理 (sameAsConsumed) -> 跳过");
            return;
        }

        // 只对「看起来像交易 JSON」的内容弹窗，避免复制普通文字也弹
        boolean looksLike = looksLikeTransactionJson(value);
        Log.d(TAG, "handleOnResume: looksLikeTransactionJson=" + looksLike);
        if (!looksLike) {
            Log.d(TAG, "handleOnResume: 不像交易 JSON -> 跳过");
            return;
        }

        JSObject payload = new JSObject();
        payload.put("value", value);
        int count = estimateCount(value);
        payload.put("count", count);
        Log.d(TAG, "handleOnResume: 发射 clipboardImportCandidate 事件, count=" + count);
        notifyListeners("clipboardImportCandidate", payload);
    }

    /** 读取系统剪贴板，返回带 value 和 hasContent 的 JSObject。 */
    private JSObject readClipboard() {
        JSObject ret = new JSObject();
        try {
            ClipboardManager cm = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) {
                ret.put("value", "");
                ret.put("hasContent", false);
                return ret;
            }
            ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) {
                ret.put("value", "");
                ret.put("hasContent", false);
                return ret;
            }
            ClipData.Item item = clip.getItemAt(0);
            if (item == null) {
                ret.put("value", "");
                ret.put("hasContent", false);
                return ret;
            }
            CharSequence text = item.getText();
            if (text != null) {
                String s = text.toString();
                ret.put("value", s);
                ret.put("hasContent", !TextUtils.isEmpty(s));
            } else {
                // 剪贴板里是 URI 或 Intent，不是文本
                ret.put("value", "");
                ret.put("hasContent", false);
            }
        } catch (Exception e) {
            ret.put("value", "");
            ret.put("hasContent", false);
        }
        return ret;
    }

    /**
     * 粗略判断剪贴板内容是否像「待导入的交易 JSON 数组」。
     * 条件：以 [ 开头、] 结尾，且包含 date/amount/type 等交易字段。
     * 严格 JSON 校验留给前端 parseJson 处理。
     */
    private boolean looksLikeTransactionJson(String text) {
        if (text == null) {
            Log.d(TAG, "looksLike: text==null");
            return false;
        }
        String trimmed = text.trim();
        if (trimmed.length() < 10) {
            Log.d(TAG, "looksLike: too short (" + trimmed.length() + ")");
            return false;
        }
        if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
            Log.d(TAG, "looksLike: not array (start=" + trimmed.charAt(0)
                    + " end=" + trimmed.charAt(trimmed.length() - 1) + ")");
            return false;
        }
        String lower = trimmed.toLowerCase();
        boolean hasDate = lower.contains("\"date\"");
        boolean hasAmount = lower.contains("\"amount\"");
        boolean hasType = lower.contains("\"type\"");
        boolean hasTxnId = lower.contains("\"sourcetransactionid\"");
        boolean ok = hasDate || hasAmount || hasType || hasTxnId;
        Log.d(TAG, "looksLike: date=" + hasDate + " amount=" + hasAmount
                + " type=" + hasType + " sourceTxnId=" + hasTxnId + " => ok=" + ok);
        return ok;
    }

    /** 粗略估计 JSON 数组条数（不 parse，仅按 '},{' 分段计数 + 1）。失败时返回 1。 */
    private int estimateCount(String text) {
        if (text == null) return 0;
        try {
            int count = 1;
            int depth = 0;
            boolean inStr = false;
            for (int i = 0; i < text.length(); i++) {
                char c = text.charAt(i);
                if (c == '"' && (i == 0 || text.charAt(i - 1) != '\\')) inStr = !inStr;
                if (inStr) continue;
                if (c == '{' || c == '[') depth++;
                else if (c == '}' || c == ']') depth--;
                else if (c == ',' && depth == 1) count++;
            }
            return Math.max(1, count);
        } catch (Exception e) {
            return 1;
        }
    }

    /** 取文本前 n 个字符，用于日志。 */
    private static String head(String text, int n) {
        if (text == null) return "(null)";
        if (text.length() <= n) return text;
        return text.substring(0, n) + "...";
    }
}
