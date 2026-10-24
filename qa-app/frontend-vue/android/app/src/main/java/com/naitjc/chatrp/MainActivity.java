package com.naitjc.chatrp;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ChatTransportPlugin.class);
        registerPlugin(ArchiveFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
