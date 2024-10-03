ARG VARIANT=latest
FROM oven/bun:${VARIANT}

RUN apt-get update \
    && apt-get -y install --no-install-recommends \
    git \
    nano \
    unzip \
    vim-tiny \
    ssh \
    ca-certificates \
    && apt-get auto-remove -y \
    && apt-get clean -y \
    && chsh -s $(which bash) bun \
    && echo 'export PS1="\e[01;32m\u\e[m:\e[01;34m\w\e[m\$ "' >> /home/bun/.bashrc

# Add Git configuration to trust the workspace directory
RUN git config --global --add safe.directory /workspaces

USER bun
