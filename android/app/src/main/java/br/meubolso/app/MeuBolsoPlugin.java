package br.meubolso.app;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Funções nativas do Meu Bolso:
 * - versão instalada do app;
 * - baixar a atualização (APK) dentro do app e abrir o instalador do Android;
 * - desbloqueio com digital / PIN do aparelho.
 */
@CapacitorPlugin(name = "MeuBolso")
public class MeuBolsoPlugin extends Plugin {

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageInfo p = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            JSObject r = new JSObject();
            r.put("versionName", p.versionName);
            r.put("versionCode", Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** Baixa o APK de `url` para o cache do app e abre a tela "Instalar" do Android. */
    @PluginMethod
    public void installUpdate(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("Falta a url");
            return;
        }
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
            // Primeira vez: o Android exige que o usuário permita este app instalar atualizações.
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            JSObject r = new JSObject();
            r.put("status", "needs-permission");
            call.resolve(r);
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(ctx.getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("sem espaço no cache");
                File out = new File(dir, "meu-bolso.apk");

                HttpURLConnection c = open(url);
                int hops = 0;
                while (c.getResponseCode() / 100 == 3 && hops++ < 6) { // GitHub redireciona para outro domínio
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    c = open(loc);
                }
                if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());

                long total = c.getContentLengthLong();
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[65536];
                    long done = 0;
                    int last = -1;
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            int pct = (int) (done * 100 / total);
                            if (pct != last && pct % 5 == 0) {
                                last = pct;
                                JSObject ev = new JSObject();
                                ev.put("percent", pct);
                                notifyListeners("updateProgress", ev);
                            }
                        }
                    }
                }
                c.disconnect();

                Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", out);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);

                JSObject r = new JSObject();
                r.put("status", "installing");
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Não consegui baixar a atualização: " + e.getMessage());
            }
        }).start();
    }

    private HttpURLConnection open(String u) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
        c.setInstanceFollowRedirects(false);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "MeuBolso-Android");
        return c;
    }

    /** O aparelho tem digital, rosto, PIN ou padrão configurado? */
    @PluginMethod
    public void canLock(PluginCall call) {
        KeyguardManager km = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        JSObject r = new JSObject();
        r.put("available", km != null && (Build.VERSION.SDK_INT < 23 ? km.isKeyguardSecure() : km.isDeviceSecure()));
        call.resolve(r);
    }

    /** Pede digital (ou PIN/padrão do aparelho). Resolve com { ok: true|false }. */
    @PluginMethod
    public void authenticate(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            BiometricPrompt.PromptInfo.Builder b = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Meu Bolso")
                    .setSubtitle("Desbloqueie para ver suas finanças");
            if (Build.VERSION.SDK_INT >= 30) {
                b.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK
                        | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
            } else {
                b.setDeviceCredentialAllowed(true);
            }
            BiometricPrompt prompt = new BiometricPrompt((FragmentActivity) getActivity(),
                    ContextCompat.getMainExecutor(getContext()),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            JSObject o = new JSObject();
                            o.put("ok", true);
                            call.resolve(o);
                        }

                        @Override
                        public void onAuthenticationError(int code, CharSequence msg) {
                            JSObject o = new JSObject();
                            o.put("ok", false);
                            o.put("error", String.valueOf(msg));
                            call.resolve(o);
                        }
                    });
            prompt.authenticate(b.build());
        });
    }
}
