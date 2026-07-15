#!/bin/bash
cd /root/fiji-it-solutions/backend
source $HOME/.local/bin/env
uv run --active python run.py >> /tmp/fiji.log 2>&1
