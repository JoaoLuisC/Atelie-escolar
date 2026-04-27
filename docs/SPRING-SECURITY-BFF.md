# Spring Boot BFF para Auth do Cliente (Supabase)

Este material traz blocos completos para implementar o fluxo BFF no Spring Boot:
- login/cadastro via backend
- cookie `HttpOnly`, `Secure`, `SameSite=Strict`
- callback OAuth Google
- filtro de sessão
- rate limiting com Caffeine (5 falhas)

## 1) Dependencias (pom.xml)

```xml
<dependencies>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
  </dependency>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
  </dependency>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
  </dependency>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-json</artifactId>
  </dependency>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-webflux</artifactId>
  </dependency>
  <dependency>
    <groupId>com.github.ben-manes.caffeine</groupId>
    <artifactId>caffeine</artifactId>
    <version>3.1.8</version>
  </dependency>
</dependencies>
```

## 2) Configuracao (application.yml)

```yaml
app:
  security:
    customer-session-cookie-name: customer_session
    customer-session-ttl-seconds: 28800
    customer-session-secret: ${CUSTOMER_SESSION_SECRET}
  supabase:
    url: ${SUPABASE_URL}
    anon-key: ${SUPABASE_ANON_KEY}

spring:
  jackson:
    default-property-inclusion: non_null
```

## 3) DTOs

```java
package com.example.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CustomerLoginRequest(
        @Email @NotBlank String email,
        @NotBlank String password
) {}

public record CustomerRegisterRequest(
        @NotBlank @Size(min = 2, max = 120) String name,
        @Email @NotBlank String email,
        @NotBlank @Size(min = 6, max = 120) String password
) {}

public record GoogleCallbackRequest(
        @NotBlank String accessToken
) {}

public record CustomerUserResponse(
        String uid,
        String email,
        String name
) {}

public record AuthResponse(
        boolean success,
        boolean authenticated,
        boolean verificationRequired,
        String error,
        CustomerUserResponse user
) {
    public static AuthResponse success(CustomerUserResponse user) {
        return new AuthResponse(true, user != null, false, null, user);
    }

    public static AuthResponse verificationRequired() {
        return new AuthResponse(true, false, true, null, null);
    }

    public static AuthResponse invalidCredentials() {
        return new AuthResponse(false, false, false, "Credenciais inválidas", null);
    }
}
```

## 4) Cliente Supabase (server-to-server)

```java
package com.example.auth.supabase;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Map;

@Component
public class SupabaseAuthClient {
    private final WebClient webClient;

    public SupabaseAuthClient(
            @Value("${app.supabase.url}") String url,
            @Value("${app.supabase.anon-key}") String anonKey
    ) {
        this.webClient = WebClient.builder()
                .baseUrl(url.replaceAll("/+$", "") + "/auth/v1")
                .defaultHeader("apikey", anonKey)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    public Mono<TokenResponse> passwordLogin(String email, String password) {
        return webClient.post()
                .uri("/token?grant_type=password")
                .bodyValue(Map.of("email", email, "password", password))
                .retrieve()
                .bodyToMono(TokenResponse.class);
    }

    public Mono<TokenResponse> signup(String name, String email, String password) {
        return webClient.post()
                .uri("/signup")
                .bodyValue(Map.of(
                        "email", email,
                        "password", password,
                        "data", Map.of("full_name", name, "name", name)
                ))
                .retrieve()
                .bodyToMono(TokenResponse.class);
    }

    public Mono<UserResponse> getUser(String accessToken) {
        return webClient.get()
                .uri("/user")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .retrieve()
                .bodyToMono(UserResponse.class);
    }

    public record TokenResponse(
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("refresh_token") String refreshToken,
            UserResponse user
    ) {}

    public record UserResponse(
            String id,
            String email,
            @JsonProperty("user_metadata") Map<String, Object> userMetadata
    ) {}
}
```

## 5) Sessao em cookie assinado

```java
package com.example.auth.session;

import com.example.auth.dto.CustomerUserResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

@Service
public class CustomerSessionCookieService {
    private final String cookieName;
    private final long ttlSeconds;
    private final String secret;
    private final ObjectMapper mapper;

    public CustomerSessionCookieService(
            @Value("${app.security.customer-session-cookie-name:customer_session}") String cookieName,
            @Value("${app.security.customer-session-ttl-seconds:28800}") long ttlSeconds,
            @Value("${app.security.customer-session-secret}") String secret,
            ObjectMapper mapper
    ) {
        this.cookieName = cookieName;
        this.ttlSeconds = ttlSeconds;
        this.secret = secret;
        this.mapper = mapper;
    }

    public String cookieName() {
        return cookieName;
    }

    public ResponseCookie buildCookie(CustomerUserResponse user, boolean secure) {
        long now = Instant.now().getEpochSecond();
        Map<String, Object> payload = Map.of(
                "sub", "customer",
                "uid", user.uid(),
                "email", user.email(),
                "name", user.name() == null ? "" : user.name(),
                "iat", now,
                "exp", now + ttlSeconds
        );

        String encodedPayload = base64Url(write(payload));
        String signature = hmac(encodedPayload);
        String token = encodedPayload + "." + signature;

        return ResponseCookie.from(cookieName, token)
                .httpOnly(true)
                .secure(secure)
                .sameSite("Strict")
                .path("/")
                .maxAge(Duration.ofSeconds(ttlSeconds))
                .build();
    }

    public ResponseCookie clearCookie(boolean secure) {
        return ResponseCookie.from(cookieName, "")
                .httpOnly(true)
                .secure(secure)
                .sameSite("Strict")
                .path("/")
                .maxAge(Duration.ZERO)
                .build();
    }

    public CustomerUserResponse verify(String token) {
        if (token == null || !token.contains(".")) return null;
        String[] parts = token.split("\\.", 2);
        String payload = parts[0];
        String signature = parts[1];

        String expected = hmac(payload);
        if (!constantTimeEquals(signature, expected)) return null;

        Map<?, ?> data = read(base64UrlDecode(payload));
        if (!"customer".equals(String.valueOf(data.get("sub")))) return null;

        long exp = Long.parseLong(String.valueOf(data.get("exp")));
        if (exp <= Instant.now().getEpochSecond()) return null;

        return new CustomerUserResponse(
                String.valueOf(data.get("uid")),
                String.valueOf(data.get("email")),
                String.valueOf(data.getOrDefault("name", ""))
        );
    }

    private String write(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<?, ?> read(String value) {
        try {
            return mapper.readValue(value, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String base64Url(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private String base64UrlDecode(String value) {
        return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
    }

    private String hmac(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private boolean constantTimeEquals(String a, String b) {
        byte[] left = a == null ? new byte[0] : a.getBytes(StandardCharsets.UTF_8);
        byte[] right = b == null ? new byte[0] : b.getBytes(StandardCharsets.UTF_8);
        if (left.length != right.length) return false;
        int result = 0;
        for (int i = 0; i < left.length; i++) result |= left[i] ^ right[i];
        return result == 0;
    }
}
```

## 6) Rate limiting em memoria (Caffeine)

```java
package com.example.auth.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
public class LoginAttemptService {
    private static final int MAX_FAILED_ATTEMPTS = 5;
    private final Cache<String, Integer> attempts = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(10))
            .maximumSize(100_000)
            .build();

    public boolean isBlocked(String key) {
        Integer current = attempts.getIfPresent(key);
        return current != null && current >= MAX_FAILED_ATTEMPTS;
    }

    public void onFailure(String key) {
        attempts.asMap().merge(key, 1, Integer::sum);
    }

    public void onSuccess(String key) {
        attempts.invalidate(key);
    }
}
```

## 7) Controller BFF

```java
package com.example.auth.api;

import com.example.auth.dto.*;
import com.example.auth.security.LoginAttemptService;
import com.example.auth.session.CustomerSessionCookieService;
import com.example.auth.supabase.SupabaseAuthClient;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth/customer")
public class CustomerAuthController {
    private final SupabaseAuthClient supabase;
    private final CustomerSessionCookieService cookieService;
    private final LoginAttemptService attempts;

    public CustomerAuthController(
            SupabaseAuthClient supabase,
            CustomerSessionCookieService cookieService,
            LoginAttemptService attempts
    ) {
        this.supabase = supabase;
        this.cookieService = cookieService;
        this.attempts = attempts;
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody CustomerLoginRequest request, HttpServletRequest http) {
        String key = clientKey(http);
        if (attempts.isBlocked(key)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(AuthResponse.invalidCredentials());
        }

        try {
            var token = supabase.passwordLogin(request.email(), request.password()).block();
            if (token == null || token.user() == null) {
                attempts.onFailure(key);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(AuthResponse.invalidCredentials());
            }

            var user = new CustomerUserResponse(
                    token.user().id(),
                    token.user().email(),
                    String.valueOf(token.user().userMetadata() == null ? "" : token.user().userMetadata().getOrDefault("full_name", ""))
            );

            attempts.onSuccess(key);
            return ResponseEntity.ok()
                    .header("Set-Cookie", cookieService.buildCookie(user, isSecure(http)).toString())
                    .body(AuthResponse.success(user));
        } catch (Exception ex) {
            attempts.onFailure(key);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(AuthResponse.invalidCredentials());
        }
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody CustomerRegisterRequest request, HttpServletRequest http) {
        try {
            var token = supabase.signup(request.name(), request.email(), request.password()).block();
            if (token == null || token.user() == null) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(AuthResponse.invalidCredentials());
            }

            if (token.accessToken() == null || token.accessToken().isBlank()) {
                return ResponseEntity.ok(AuthResponse.verificationRequired());
            }

            var user = new CustomerUserResponse(
                    token.user().id(),
                    token.user().email(),
                    String.valueOf(token.user().userMetadata() == null ? "" : token.user().userMetadata().getOrDefault("full_name", request.name()))
            );

            return ResponseEntity.ok()
                    .header("Set-Cookie", cookieService.buildCookie(user, isSecure(http)).toString())
                    .body(AuthResponse.success(user));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(AuthResponse.invalidCredentials());
        }
    }

    @PostMapping("/google/callback")
    public ResponseEntity<AuthResponse> googleCallback(@Valid @RequestBody GoogleCallbackRequest request, HttpServletRequest http) {
        try {
            var userData = supabase.getUser(request.accessToken()).block();
            if (userData == null || userData.id() == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(AuthResponse.invalidCredentials());
            }

            var user = new CustomerUserResponse(
                    userData.id(),
                    userData.email(),
                    String.valueOf(userData.userMetadata() == null ? "" : userData.userMetadata().getOrDefault("full_name", ""))
            );

            return ResponseEntity.ok()
                    .header("Set-Cookie", cookieService.buildCookie(user, isSecure(http)).toString())
                    .body(AuthResponse.success(user));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(AuthResponse.invalidCredentials());
        }
    }

    @GetMapping("/session")
    public ResponseEntity<AuthResponse> session(@CookieValue(name = "customer_session", required = false) String cookie) {
        var user = cookieService.verify(cookie);
        if (user == null) {
            return ResponseEntity.ok(new AuthResponse(true, false, false, null, null));
        }
        return ResponseEntity.ok(AuthResponse.success(user));
    }

    @PostMapping("/logout")
    public ResponseEntity<AuthResponse> logout(HttpServletRequest http) {
        return ResponseEntity.ok()
                .header("Set-Cookie", cookieService.clearCookie(isSecure(http)).toString())
                .body(new AuthResponse(true, false, false, null, null));
    }

    private String clientKey(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private boolean isSecure(HttpServletRequest request) {
        if (request.isSecure()) return true;
        String proto = request.getHeader("X-Forwarded-Proto");
        return "https".equalsIgnoreCase(proto);
    }
}
```

## 8) Filtro de seguranca (BFF session filter)

```java
package com.example.auth.security;

import com.example.auth.session.CustomerSessionCookieService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class CustomerSessionFilter extends OncePerRequestFilter {
    private final CustomerSessionCookieService cookieService;

    public CustomerSessionFilter(CustomerSessionCookieService cookieService) {
        this.cookieService = cookieService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String token = extractCookie(request, cookieService.cookieName());
        var user = cookieService.verify(token);

        if (user != null) {
            var auth = new UsernamePasswordAuthenticationToken(
                    user.email(),
                    null,
                    List.of(new SimpleGrantedAuthority("ROLE_CUSTOMER"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        filterChain.doFilter(request, response);
    }

    private String extractCookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        for (Cookie cookie : cookies) {
            if (name.equals(cookie.getName())) return cookie.getValue();
        }
        return null;
    }
}
```

## 9) SecurityConfig

```java
package com.example.auth.config;

import com.example.auth.security.CustomerSessionFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, CustomerSessionFilter customerSessionFilter) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(Customizer.withDefaults())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.POST, "/api/auth/customer/login", "/api/auth/customer/register", "/api/auth/customer/google/callback", "/api/auth/customer/logout").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/auth/customer/session", "/api/auth/customer/google/start").permitAll()
                .requestMatchers("/api/customer/**").hasRole("CUSTOMER")
                .anyRequest().permitAll()
            )
            .addFilterBefore(customerSessionFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
```
