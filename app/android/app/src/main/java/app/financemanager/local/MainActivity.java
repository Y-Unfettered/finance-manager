package app.financemanager.local;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private View privacyOverlay;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 创建原生遮罩 View：白色背景 + 居中文字"财务经理"
        // 在窗口失去焦点时立即显示，先于系统截图。
        // 用户上滑进入任务中心时，窗口会先触发 onWindowFocusChanged(false)，
        // 系统**之后**才截图。比 onPause 早一个时序，确保截图前已遮罩。
        TextView overlay = new TextView(this);
        overlay.setText("财务经理");
        overlay.setTextColor(Color.parseColor("#9E9E9E"));
        overlay.setTextSize(20);
        overlay.setGravity(Gravity.CENTER);
        overlay.setBackgroundColor(Color.WHITE);
        overlay.setVisibility(View.GONE);
        addContentView(
            overlay,
            new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT
            )
        );
        privacyOverlay = overlay;
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // 窗口失去焦点（用户上滑、通知栏下拉、切到其他 App）时立即显示遮罩。
        // 此时系统尚未截图，遮罩能先于截图生效。
        // 窗口重新获得焦点时隐藏遮罩。
        if (privacyOverlay != null) {
            privacyOverlay.setVisibility(hasFocus ? View.GONE : View.VISIBLE);
        }
    }
}
