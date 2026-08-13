package app.financemanager.capture.notification;

import android.accessibilityservice.AccessibilityService;
import android.util.Log;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import app.financemanager.capture.accessibility.CapturedPaymentInfo;
import app.financemanager.capture.accessibility.WhitelistPackages;

/**
 * 通知文本解析适配器接口。
 * 各支付 APP 提供一个实现，从通知标题 + 正文中提取支付信息。
 */
public interface NotificationParserAdapter {

    String getPackageName();

    /** 解析通知文本。返回 null 表示无法解析或不符合支付通知格式。 */
    CapturedPaymentInfo parse(String title, String text, String packageName);
}