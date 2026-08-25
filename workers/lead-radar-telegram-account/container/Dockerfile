# syntax=docker/dockerfile:1.7

# TDLib intentionally has no regular upstream release artifacts. The reviewed
# source is pinned to one full commit from the official tdlib/td repository.
ARG TDLIB_COMMIT=d1085f9cebc5a62379991ae1652673954f229c1f
ARG DEBIAN_SNAPSHOT=20260825T000000Z

FROM debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171 AS debian-base
ARG DEBIAN_SNAPSHOT
RUN printf '%s\n' \
      "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT} bookworm main" \
      "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT} bookworm-updates main" \
      "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/${DEBIAN_SNAPSHOT} bookworm-security main" \
      > /etc/apt/sources.list \
    && rm -f /etc/apt/sources.list.d/debian.sources

FROM debian-base AS tdlib-build
ARG TDLIB_COMMIT
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates cmake g++ git gperf make libssl-dev php-cli zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --filter=blob:none https://github.com/tdlib/td.git td \
    && cd td \
    && git checkout --detach "${TDLIB_COMMIT}" \
    && test "$(git rev-parse HEAD)" = "${TDLIB_COMMIT}" \
    && php SplitSource.php \
    && cmake -S . -B build \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/opt/tdlib \
      -DTD_ENABLE_JNI=OFF \
      -DTD_ENABLE_DOTNET=OFF \
    && cmake --build build --target tdjson --parallel 2 \
    && cmake --install build \
    && strip /opt/tdlib/lib/libtdjson.so*

FROM debian-base AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates libssl3 python3 python3-pil python3-qrcode zlib1g \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 gateway \
    && useradd --system --uid 10001 --gid gateway --home /nonexistent --shell /usr/sbin/nologin gateway \
    && install -d -o gateway -g gateway -m 0700 /var/lib/tdlib
COPY --from=tdlib-build /opt/tdlib/lib/libtdjson.so* /usr/local/lib/
COPY server.py /opt/gateway/server.py
COPY correlation.py /opt/gateway/correlation.py
COPY test_correlation.py /opt/gateway/test_correlation.py
RUN ldconfig \
    && chmod 0555 /opt/gateway/server.py \
    && cd /opt/gateway \
    && python3 -m unittest test_correlation.py \
    && python3 -m py_compile server.py correlation.py \
    && rm -f /opt/gateway/test_correlation.py \
    && rm -rf /opt/gateway/__pycache__
USER 10001:10001
ENV PYTHONUNBUFFERED=1
EXPOSE 8080
ENTRYPOINT ["python3", "/opt/gateway/server.py"]
