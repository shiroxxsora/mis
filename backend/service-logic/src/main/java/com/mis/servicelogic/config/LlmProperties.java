package com.mis.servicelogic.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "llm")
public record LlmProperties(
        String apiUrl,
        String model,
        String systemPrompt,
        String attendanceSystemPrompt,
        Integer connectTimeoutSeconds,
        Integer readTimeoutSeconds
) {
}
