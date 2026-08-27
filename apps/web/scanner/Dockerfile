FROM docker.io/clamav/clamav:1.5.4@sha256:0e85467cb0d6e7d860a45035707741cd5ffc032ffefc6002a3510c75b6d07027

# The upstream entrypoint starts both clamd and freshclam. A resident clamd is
# wasteful for this personal, queue-driven workload and could not become ready
# inside the bounded Cloudflare Container startup window. Keep the container
# idle instead; the Worker refreshes signatures and runs one bounded clamscan
# process for each quarantined object.
COPY --chown=clamav:clamav studio-7321.ndb /var/lib/clamav/studio-7321.ndb
USER clamav
ENTRYPOINT ["sleep", "infinity"]
