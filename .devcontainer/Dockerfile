FROM node:24.14.1

# Enable corepack for pnpm
RUN corepack enable

# Install basic dev tools and setup locale
RUN apt update -y \
  && apt install -y sudo curl locales build-essential git \
  && echo 'en_US.UTF-8 UTF-8' > /etc/locale.gen \
  && locale-gen \
  && rm -rf /var/lib/apt/lists/*

# Create the dev user and have him sudo without password
ENV USER=dev
RUN userdel node \
  && useradd -mG sudo -s /bin/bash $USER \
  && echo "$USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/$USER

# Switch to default user
USER $USER

# Remove sudo note on login
RUN touch /home/$USER/.sudo_as_admin_successful

# Install pnpm and setup playwright
COPY --chown=$USER:$USER package.json pnpm-workspace.yaml /tmp/workspace/
RUN cd /tmp/workspace/ \
  && corepack install \
  && pnpm install 'playwright@catalog:' \
  && pnpm playwright:install \
  && rm -rf /tmp/workspace

# Run build-time user setup script if there's any
COPY --chown=$USER:$USER .devcontainer /tmp/.devcontainer
RUN [ ! -f /tmp/.devcontainer/user/build.sh ] \
  || bash /tmp/.devcontainer/user/build.sh

# Switch back to root, vscode devcontainers will log in as dev
USER root

# Command to stay running indefinitely
CMD sleep infinity
