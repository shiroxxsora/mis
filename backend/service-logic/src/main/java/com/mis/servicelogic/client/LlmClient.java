package com.mis.servicelogic.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.mis.servicelogic.config.LlmProperties;
import com.mis.servicelogic.exception.LlmParseException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class LlmClient {

    private static final Logger log = LoggerFactory.getLogger(LlmClient.class);

    private static final Pattern PERCENT_PATTERN = Pattern.compile("(\\d{1,3})\\s*%");
    private static final Pattern STANDALONE_NUMBER_PATTERN = Pattern.compile("^\\s*(\\d{1,3})\\s*$");

    private final RestClient restClient;
    private final LlmProperties properties;

    public LlmClient(LlmProperties properties) {
        this.properties = properties;
        int connectTimeout = properties.connectTimeoutSeconds() == null
                ? 30
                : properties.connectTimeoutSeconds();
        int readTimeout = properties.readTimeoutSeconds() == null
                ? 600
                : properties.readTimeoutSeconds();
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(connectTimeout));
        requestFactory.setReadTimeout(Duration.ofSeconds(readTimeout));

        this.restClient = RestClient.builder()
                .baseUrl(properties.apiUrl())
                .requestFactory(requestFactory)
                .build();
        log.info(
                "LLM client configured: url={}, model={}, connectTimeout={}s, readTimeout={}s",
                properties.apiUrl(),
                properties.model(),
                connectTimeout,
                readTimeout
        );
    }

    public String summarize(String input) {
        log.info("LLM summarize: model={}, inputLength={}", properties.model(), input.length());
        String response = chat(properties.systemPrompt(), input);
        log.info("LLM summarize: responseLength={}", response.length());
        return response;
    }

    public int predictAttendanceProbability(String input) {
        log.info("LLM attendance-probability: model={}, inputLength={}", properties.model(), input.length());
        String response = chat(properties.attendanceSystemPrompt(), input);
        int probability = parseProbability(response);
        log.info("LLM attendance-probability: parsed={}%, rawResponse={}", probability, truncate(response));
        return probability;
    }

    private String chat(String systemPrompt, String input) {
        Map<String, Object> payload = Map.of(
                "model", properties.model(),
                "system_prompt", systemPrompt,
                "input", input
        );

        log.debug("LLM request to {}", properties.apiUrl());

        JsonNode body = restClient.post()
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body(JsonNode.class);

        if (body == null) {
            throw new LlmParseException("LLM вернул пустой HTTP-ответ");
        }

        String extracted = extractOutputText(body);
        if (extracted.isBlank()) {
            throw new LlmParseException("LLM вернул ответ без текста: " + truncate(body.toString()));
        }
        return extracted;
    }

    static String extractOutputText(JsonNode body) {
        if (body == null) {
            return "";
        }

        if (body.hasNonNull("output")) {
            JsonNode output = body.get("output");
            if (output.isTextual()) {
                return output.asText().trim();
            }
            if (output.isArray()) {
                StringBuilder messages = new StringBuilder();
                for (JsonNode item : output) {
                    if (!item.isObject() || !item.hasNonNull("content")) {
                        continue;
                    }
                    String type = item.hasNonNull("type") ? item.get("type").asText() : "";
                    if ("reasoning".equals(type)) {
                        continue;
                    }
                    messages.append(extractContentText(item.get("content")));
                }
                if (!messages.isEmpty()) {
                    return messages.toString().trim();
                }
                for (int i = output.size() - 1; i >= 0; i--) {
                    JsonNode item = output.get(i);
                    if (!item.isObject() || !item.hasNonNull("content")) {
                        continue;
                    }
                    String type = item.hasNonNull("type") ? item.get("type").asText() : "";
                    if ("reasoning".equals(type)) {
                        continue;
                    }
                    String text = extractContentText(item.get("content")).trim();
                    if (!text.isEmpty()) {
                        return text;
                    }
                }
            }
        }

        if (body.hasNonNull("response")) {
            return body.get("response").asText().trim();
        }
        if (body.hasNonNull("text")) {
            return body.get("text").asText().trim();
        }

        return "";
    }

    private static String extractContentText(JsonNode contentNode) {
        if (contentNode == null || contentNode.isNull()) {
            return "";
        }
        if (contentNode.isTextual()) {
            return contentNode.asText();
        }
        if (contentNode.isArray()) {
            StringBuilder blocks = new StringBuilder();
            for (JsonNode block : contentNode) {
                if (block.hasNonNull("text")) {
                    blocks.append(block.get("text").asText());
                } else if (block.isTextual()) {
                    blocks.append(block.asText());
                }
            }
            return blocks.toString();
        }
        return "";
    }

    static int parseProbability(String response) {
        if (response == null || response.isBlank()) {
            throw new LlmParseException("LLM вернул пустой ответ для вероятности явки");
        }

        Matcher percentMatcher = PERCENT_PATTERN.matcher(response);
        Integer percentValue = null;
        while (percentMatcher.find()) {
            percentValue = clampProbability(Integer.parseInt(percentMatcher.group(1)));
        }
        if (percentValue != null) {
            return percentValue;
        }

        Matcher standaloneMatcher = STANDALONE_NUMBER_PATTERN.matcher(response.trim());
        if (standaloneMatcher.matches()) {
            return clampProbability(Integer.parseInt(standaloneMatcher.group(1)));
        }

        throw new LlmParseException(
                "Не удалось извлечь вероятность явки из ответа LLM (ожидается число 0–100 или N%): "
                        + response);
    }

    private static int clampProbability(int value) {
        return Math.clamp(value, 0, 100);
    }

    private static String truncate(String value) {
        if (value.length() <= 200) {
            return value;
        }
        return value.substring(0, 200) + "...";
    }
}
