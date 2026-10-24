package com.naitjc.chatrp;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native SSE avoids WebView CORS restrictions and disconnects on cancellation. */
@CapacitorPlugin(name = "ChatTransport")
public class ChatTransportPlugin extends Plugin {
    private static class Request {
        volatile HttpURLConnection connection;
        volatile boolean cancelled;
        void cancel() {
            cancelled = true;
            if (connection != null) connection.disconnect();
        }
    }
    private final ConcurrentHashMap<String, Request> requests = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @PluginMethod
    public void request(PluginCall call) {
        String id = call.getString("id");
        if (id == null || call.getObject("body") == null) {
            call.reject("请求参数不完整");
            return;
        }
        Request request = new Request();
        requests.put(id, request);
        executor.execute(() -> {
            try {
                URL url = new URL(call.getString("url", ""));
                if (!url.getProtocol().equals("https") && !url.getProtocol().equals("http")) {
                    throw new Exception("模型地址必须使用 http 或 https");
                }
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                request.connection = connection;
                if (request.cancelled) throw new Exception("已停止");
                int timeout = call.getInt("timeout", 90000);
                connection.setConnectTimeout(timeout);
                connection.setReadTimeout(timeout);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("Authorization", "Bearer " + call.getString("apiKey", ""));
                boolean stream = call.getBoolean("stream", false);
                connection.setRequestProperty("Accept", stream ? "text/event-stream" : "application/json");
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(call.getObject("body").toString().getBytes(StandardCharsets.UTF_8));
                }
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) throw new Exception("模型请求失败（" + status + "）");
                try (InputStream input = connection.getInputStream();
                     BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                    if (!stream) {
                        StringBuilder json = new StringBuilder();
                        String line;
                        while ((line = reader.readLine()) != null) {
                            if (request.cancelled) throw new Exception("已停止");
                            json.append(line);
                        }
                        if (request.cancelled) throw new Exception("已停止");
                        call.resolve(new JSObject(json.toString()));
                    } else {
                        boolean terminal = false;
                        String finishReason = "";
                        StringBuilder text = new StringBuilder();
                        String line;
                        while ((line = reader.readLine()) != null) {
                            if (request.cancelled) throw new Exception("已停止");
                            if (!line.startsWith("data:")) continue;
                            String data = line.substring(5).trim();
                            if (data.equals("[DONE]")) { terminal = true; break; }
                            JSONObject event;
                            try { event = new JSONObject(data); } catch (Exception ignored) { continue; }
                            if (event.has("error")) throw new Exception("模型生成失败，请重试");
                            if (event.optJSONArray("choices") == null) continue;
                            JSONObject choice = event.getJSONArray("choices").optJSONObject(0);
                            if (choice == null) continue;
                            if (!choice.isNull("finish_reason")) {
                                finishReason = choice.optString("finish_reason", "");
                                terminal = !finishReason.isEmpty();
                            }
                            JSONObject delta = choice.optJSONObject("delta");
                            if (delta != null && delta.opt("content") instanceof String) {
                                String chunk = delta.getString("content");
                                text.append(chunk);
                                JSObject update = new JSObject();
                                update.put("id", id);
                                update.put("text", chunk);
                                notifyListeners("chunk", update);
                            }
                            if (terminal) break;
                        }
                        if (request.cancelled) throw new Exception("已停止");
                        if (!terminal || (!finishReason.isEmpty() && !finishReason.equals("stop"))) {
                            throw new Exception("模型回复未完整结束，请重试；本轮状态未提交");
                        }
                        JSObject result = new JSObject();
                        result.put("text", text.toString());
                        call.resolve(result);
                    }
                }
            } catch (Exception error) {
                call.reject(request.cancelled ? "已停止" : error.getMessage(), request.cancelled ? "ABORTED" : "REQUEST_FAILED");
            } finally {
                requests.remove(id);
                if (request.connection != null) request.connection.disconnect();
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Request request = requests.get(call.getString("id", ""));
        if (request != null) executor.execute(request::cancel);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        for (Request request : requests.values()) request.cancel();
        executor.shutdownNow();
    }
}
