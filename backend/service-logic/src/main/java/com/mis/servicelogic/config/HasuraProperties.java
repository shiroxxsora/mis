package com.mis.servicelogic.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hasura")
public record HasuraProperties(String url, String adminSecret) {
}
