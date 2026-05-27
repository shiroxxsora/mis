FROM liquibase/liquibase:4.33 AS liquibase

FROM postgres:18-alpine

RUN apk add --no-cache openjdk21-jre

COPY --from=liquibase /liquibase /opt/liquibase
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk
ENV PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/liquibase"

COPY docker-entrypoint-wrap.sh /usr/local/bin/docker-entrypoint-wrap.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint-wrap.sh \
    && chmod +x /usr/local/bin/docker-entrypoint-wrap.sh

ENTRYPOINT ["docker-entrypoint-wrap.sh"]
CMD ["postgres"]
