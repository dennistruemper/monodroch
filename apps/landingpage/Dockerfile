FROM busybox:latest

# Create directory for web files
RUN mkdir -p /www

# Copy static files
COPY index.html /www/
COPY styles.css /www/

# Expose port 80 (standard HTTP port)
EXPOSE 80

# Use BusyBox httpd (very minimal static file server)
# Note: BusyBox httpd requires root to bind to port 80, or use port 8080
# If port 80 doesn't work due to permissions, use: CMD ["httpd", "-f", "-v", "-p", "8080", "-h", "/www"]
CMD ["httpd", "-f", "-v", "-p", "80", "-h", "/www"]

