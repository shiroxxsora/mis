package com.mis.servicelogic.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "recognition.service")
public record RecognitionServiceProperties(String url) {
}
