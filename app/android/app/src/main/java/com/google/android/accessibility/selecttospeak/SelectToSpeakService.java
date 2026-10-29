package com.google.android.accessibility.selecttospeak;

import app.financemanager.capture.accessibility.PaymentAccessibilityService;

/**
 * 伪装成系统"选择朗读"(Select to Speak)无障碍服务，绕过微信 8.0.52+ 的节点混淆白名单。
 * 类名必须与系统内置服务完全一致：com.google.android.accessibility.selecttospeak.SelectToSpeakService
 * 实际逻辑全部继承自 PaymentAccessibilityService。
 */
public class SelectToSpeakService extends PaymentAccessibilityService {
}
