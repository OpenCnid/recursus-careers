FROM node@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS node-runtime

FROM python@sha256:0bee7276f83efd4a1ee05bbbf4281d95ed28e079220a9457f25a93e3f1e3c31b AS build
COPY --from=node-runtime /usr/local /usr/local
RUN npm install --global pnpm@9.14.4
COPY component/ /opt/rc7/component/
WORKDIR /opt/rc7/component
RUN pnpm install --frozen-lockfile && pnpm run build
RUN python3 -m venv /opt/rc7/python \
    && /opt/rc7/python/bin/pip install --disable-pip-version-check --no-cache-dir --require-hashes --requirement /opt/rc7/component/python/managed-requirements.lock \
    && PYTHONPATH=/opt/rc7/component/vendor/prime-agent-runtime/src:/opt/rc7/component/python/dsh-rlm-runtime/src /opt/rc7/python/bin/python -c "import dill, ipykernel, nest_asyncio, rlm, dsh_rlm_runtime; print('RC7_GATE_C_PYTHON_READY')"

FROM python@sha256:0bee7276f83efd4a1ee05bbbf4281d95ed28e079220a9457f25a93e3f1e3c31b AS runtime
ARG RC7_GATE_C_WORKER_SHA256
LABEL rc7.policy="rc7-rlm-gate-c-contained-launcher-v1" \
      rc7.component.commit="4772c12b0630706f14d16e70be0ad67bff116690" \
      rc7.component.pnpm-lock-sha256="d1ae2cc697db86d42dadda4653f82ae64131f7010b440e130d5b4fb6d30cc08d" \
      rc7.component.uv-lock-sha256="588a9165560eba4a70bfad798b4f67418c09498dc77b64e8c5ec7b4e150c7413" \
      rc7.component.managed-requirements-sha256="0d72c8c450c62fdb405db96cfa5dbffb3a60eedacb24dc37c028267696d258af" \
      rc7.gate-c.worker-sha256="${RC7_GATE_C_WORKER_SHA256}"
COPY --from=node-runtime /usr/local /usr/local
COPY --from=build /opt/rc7/component /opt/rc7/component
COPY --from=build /opt/rc7/python /opt/rc7/python
COPY gate-c-rlm-worker.mjs /opt/rc7/app/gate-c-rlm-worker.mjs
WORKDIR /rc7/state
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/node", "/opt/rc7/app/gate-c-rlm-worker.mjs"]
