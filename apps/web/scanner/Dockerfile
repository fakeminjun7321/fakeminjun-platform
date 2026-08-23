FROM docker.io/clamav/clamav:1.5.4@sha256:6e348a93ef3be6a52e90819062313a2ef35c260708121d4465e67b949ae4e616

# The upstream entrypoint starts both clamd and freshclam. A resident clamd is
# wasteful for this personal, queue-driven workload and could not become ready
# inside the bounded Cloudflare Container startup window. Keep the container
# idle instead; the Worker refreshes signatures and runs one bounded clamscan
# process for each quarantined object.
COPY --chown=clamav:clamav studio-7321.ndb /var/lib/clamav/studio-7321.ndb
USER clamav
ENTRYPOINT ["sleep", "infinity"]
