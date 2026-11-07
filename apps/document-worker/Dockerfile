# Browser and library versions must match. No browser/package download at runtime.
FROM mcr.microsoft.com/playwright:v1.61.1-noble
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY package.json package-lock.json ./
RUN node -e "if (+process.versions.node.split('.')[0] < 22) process.exit(1)" && npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=pwuser:pwuser src ./src
COPY --chown=pwuser:pwuser fonts ./fonts
USER pwuser
EXPOSE 3000
CMD ["node", "src/index.mjs"]
