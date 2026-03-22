FROM oven/bun:1.3.11

# Install basic dev tools and setup locale
RUN apt update -y \
    && apt install -y sudo curl locales build-essential git \
    && echo 'en_US.UTF-8 UTF-8' > /etc/locale.gen \
    && locale-gen \
    && rm -rf /var/lib/apt/lists/*

# Create the dev user and have him sudo without password
ENV USER=dev
RUN userdel bun \
    && useradd -mG sudo -s /bin/bash $USER \
    && echo "$USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/$USER

# Pre-create a workspace directory with the correct permissions
RUN mkdir /workspace && chown $USER:$USER /workspace
WORKDIR /workspace

# Switch to default user
USER $USER

# Remove sudo note on login
RUN touch /home/$USER/.sudo_as_admin_successful

# Install Playwright chromium and its system dependencies
RUN bunx playwright install chromium --with-deps

# Run build-time user setup script if there's any
COPY --chown=$USER:$USER .devcontainer /tmp/.devcontainer
RUN [ ! -f /tmp/.devcontainer/user/build.sh ] \
    || bash /tmp/.devcontainer/user/build.sh

# Switch back to root, vscode devcontainers will log in as dev
USER root

# Command to stay running indefinitely
CMD sleep infinity
