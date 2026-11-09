# The intro worker for SAGA (worker.py): makes each user's own intro clip
# when their config or sequence changes in the CMS. Run by
# /opt/ti-demo/docker-compose.yml with the repo, the renders and the output
# folder mounted, so a push to demo-2.0 brings new code (update.sh restarts it).
#
# Node 22 for render.js (it needs the built-in WebSocket), Chromium to draw
# the screens, and Python with numpy and OpenCV from Debian for intro.py.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-numpy python3-opencv ffmpeg chromium \
 && rm -rf /var/lib/apt/lists/*
ENV BROWSER=/usr/bin/chromium \
    TI_RENDERS=/renders \
    TI_CUSTOM_DIR=/custom \
    TI_CMS_URL=http://ti-cms:3000/ \
    PYTHONUNBUFFERED=1
WORKDIR /app
CMD ["python3", "demo/tools/screen-swap/worker.py"]
