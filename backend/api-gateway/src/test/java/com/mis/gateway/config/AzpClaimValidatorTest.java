package com.mis.gateway.config;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

import static org.assertj.core.api.Assertions.assertThat;

class AzpClaimValidatorTest {

    private final AzpClaimValidator validator = new AzpClaimValidator("mis-frontend");

    @Test
    void validate_matchingAzp_succeeds() {
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .claim("azp", "mis-frontend")
                .build();

        OAuth2TokenValidatorResult result = validator.validate(jwt);

        assertThat(result.hasErrors()).isFalse();
    }

    @Test
    void validate_mismatchedAzp_failsWithDescription() {
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .claim("azp", "evil-client")
                .build();

        OAuth2TokenValidatorResult result = validator.validate(jwt);

        assertThat(result.hasErrors()).isTrue();
        assertThat(result.getErrors()).singleElement()
                .satisfies(err -> assertThat(err.getDescription()).contains("evil-client"));
    }

    @Test
    void validate_missingAzp_fails() {
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .claim("sub", "user-1")
                .build();

        OAuth2TokenValidatorResult result = validator.validate(jwt);

        assertThat(result.hasErrors()).isTrue();
        assertThat(result.getErrors()).singleElement()
                .satisfies(err -> assertThat(err.getDescription()).contains("Unexpected azp claim: null"));
    }
}
