package com.mis.gateway.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
@Import(SecurityConfigTest.TestJwtDecoderConfig.class)
class SecurityConfigTest {

    @Autowired
    private WebTestClient webTestClient;

    @Test
    void apiWithoutToken_returnsUnauthorized() {
        webTestClient.get()
                .uri("/api/recognition/health")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void apiWithValidToken_isNotUnauthorized() {
        webTestClient.get()
                .uri("/api/recognition/health")
                .header("Authorization", "Bearer valid-token")
                .exchange()
                .expectStatus().value(status -> {
                    if (status == 401 || status == 403) {
                        throw new AssertionError("Valid token must pass gateway auth, got " + status);
                    }
                });
    }

    @Test
    void postApiWithoutToken_returnsUnauthorized() {
        webTestClient.post()
                .uri("/api/recognition/start")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"source\":\"test\",\"payload\":\"x\"}")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void getGraphqlWithoutToken_isPermitted() {
        webTestClient.get()
                .uri("/graphql")
                .exchange()
                .expectStatus().value(status -> {
                    if (status == 401) {
                        throw new AssertionError("GET /graphql must not require JWT at gateway");
                    }
                });
    }

    @Test
    void postGraphqlWithoutToken_returnsUnauthorized() {
        webTestClient.post()
                .uri("/graphql")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"query\":\"{ __typename }\"}")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    void actuatorHealth_isPublic() {
        webTestClient.get()
                .uri("/actuator/health")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void optionsPreflight_doesNotRequireJwt() {
        webTestClient.options()
                .uri("/api/recognition/health")
                .exchange()
                .expectStatus().value(status -> {
                    if (status == 401) {
                        throw new AssertionError("OPTIONS preflight must not require JWT");
                    }
                });
    }

    @Test
    void apiWithInvalidToken_returnsUnauthorized() {
        webTestClient.get()
                .uri("/api/recognition/health")
                .header("Authorization", "Bearer bad-token")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @TestConfiguration
    static class TestJwtDecoderConfig {

        @Bean
        @Primary
        ReactiveJwtDecoder testJwtDecoder() {
            return token -> {
                if ("valid-token".equals(token)) {
                    Jwt jwt = Jwt.withTokenValue(token)
                            .header("alg", "none")
                            .claim("azp", "mis-frontend")
                            .claim("sub", "demo-user")
                            .build();
                    return Mono.just(jwt);
                }
                return Mono.error(new BadJwtException("invalid token"));
            };
        }
    }
}
