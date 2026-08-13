package app.financemanager.capture.accessibility;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityNodeInfo;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;

/**
 * 统一支付解析器接口。
 *
 * 每个支付 APP 提供一个实现，从窗口文本中解析出金额/商户/账户。
 * Registry 按包名路由到对应适配器。
 */
public interface PaymentParserAdapter {

    String TAG = "PaymentParserAdapter";

    /** 当前 APP 的白名单包名。 */
    String getPackageName();

    /** 解析当前窗口内容，返回支付信息。无法解析时返回 null。 */
    CapturedPaymentInfo parse(AccessibilityService service, AccessibilityNodeInfo root);

    /**
     * 从 root 树中提取所有可见节点的文本，拼接为一段完整文本。
     * 各适配器可基于此文本做正则匹配。
     */
    static String extractVisibleText(AccessibilityNodeInfo root) {
        List<String> texts = new ArrayList<>();
        collectText(root, texts, 0);
        return String.join("\n", texts);
    }

    private static void collectText(AccessibilityNodeInfo node, List<String> result, int depth) {
        if (node == null || depth > 30) return;
        try {
            CharSequence text = node.getText();
            if (text != null && !text.toString().trim().isEmpty()) {
                result.add(text.toString().trim());
            }
            CharSequence contentDesc = node.getContentDescription();
            if (contentDesc != null && !contentDesc.toString().trim().isEmpty()) {
                result.add(contentDesc.toString().trim());
            }
            for (int i = 0; i < node.getChildCount(); i++) {
                collectText(node.getChild(i), result, depth + 1);
            }
        } catch (Exception e) {
            Log.w(TAG, "collectText 异常 depth=" + depth, e);
        } finally {
            if (node != null) node.recycle();
        }
    }
}