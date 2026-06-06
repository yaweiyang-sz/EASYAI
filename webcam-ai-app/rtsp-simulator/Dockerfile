FROM alpine:latest

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY generate_test_video.sh .
RUN chmod +x generate_test_video.sh
RUN ./generate_test_video.sh

CMD ["ffmpeg", "-re", "-stream_loop", "-1", "-i", "test_video.mp4", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-f", "rtsp", "-rtsp_transport", "tcp", "rtsp://rtsp-server:8554/camera1"]
