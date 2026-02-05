package com.genex.lms;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // CRITICAL: Enable FLAG_SECURE to block screenshots and screen recording
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
        
        // Additional security - ensure flag persists
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
    
    @Override
    public void onResume() {
        super.onResume();
        
        // Re-apply FLAG_SECURE when app resumes
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
    }
    
    @Override
    public void onStart() {
        super.onStart();
        
        // Apply on start as well
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
}