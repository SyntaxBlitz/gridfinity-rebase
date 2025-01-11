#!/bin/bash

npm run build

if [ $? -ne 0 ]; then
  echo "Build failed. Exiting."
  exit 1
fi

# wasm is on a remote bucket, no need to fill poor fermata's disk any further
rsync -azP --exclude=openscad*.wasm dist/ nginx@fermata:/home/nginx/www/gridfinity.tools/rebase-new
ssh nginx@fermata "rm -rf /home/nginx/www/gridfinity.tools/rebase && mv /home/nginx/www/gridfinity.tools/rebase-new /home/nginx/www/gridfinity.tools/rebase"