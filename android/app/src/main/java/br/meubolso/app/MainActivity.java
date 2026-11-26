package br.meubolso.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MeuBolsoPlugin.class); // atualização dentro do app e bloqueio com digital
        super.onCreate(savedInstanceState);
    }
}
