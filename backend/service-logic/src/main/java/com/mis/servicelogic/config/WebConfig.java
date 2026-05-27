package com.mis.servicelogic.config;

import org.springframework.context.annotation.Configuration;

@Configuration
public class WebConfig {
    // CORS обрабатывается на api-gateway; service-logic доступен только из внутренней сети Docker.
}
