#!/bin/sh

ffmpeg -f lavfi -i "testsrc=size=640x480:duration=10:rate=15" \
  -f lavfi -i "sine=frequency=1000:duration=10:sample_rate=44100" \
  -c:v libx264 -preset ultrafast -c:a aac -shortest test_video.mp4
