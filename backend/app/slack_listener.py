import logging
import signal
import sys
import threading
import time

from app.core.config import settings
from app.services.slack import handle_block_action

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("slack_listener")


def create_socket_mode_client():
    """
    Initializes and returns a configured SocketModeClient.
    Raises ValueError if SLACK_APP_TOKEN is missing.
    """
    app_token = settings.SLACK_APP_TOKEN
    if not app_token or not app_token.strip():
        raise ValueError(
            "SLACK_APP_TOKEN is not set or empty. "
            "Please configure SLACK_APP_TOKEN (xapp-...) in your environment to run Socket Mode."
        )

    from slack_sdk.socket_mode import SocketModeClient
    from slack_sdk.socket_mode.request import SocketModeRequest
    from slack_sdk.socket_mode.response import SocketModeResponse

    client = SocketModeClient(
        app_token=app_token.strip(),
        auto_reconnect_enabled=True,
    )

    def process_socket_mode_request(sm_client: SocketModeClient, req: SocketModeRequest) -> None:
        if req.type == "interactive":
            # 1. Immediately acknowledge the event to Slack (< 3 seconds rule)
            ack_response = SocketModeResponse(envelope_id=req.envelope_id)
            sm_client.send_socket_mode_response(ack_response)

            payload = req.payload or {}
            # 2. Dispatch block actions to the core handler
            if payload.get("type") == "block_actions":
                try:
                    result = handle_block_action(payload)
                    logger.info(f"Processed Slack block action: status={result.get('status')}")
                except Exception as exc:
                    logger.error(f"Error processing Slack block action: {exc}")

    client.socket_mode_request_listeners.append(process_socket_mode_request)
    return client


def main() -> None:
    logger.info("Starting AutoPulse Slack Socket Mode listener process...")
    try:
        client = create_socket_mode_client()
    except ValueError as val_err:
        logger.error(str(val_err))
        sys.exit(1)

    exit_event = threading.Event()

    def handle_shutdown(signum, frame):
        logger.info(f"Received signal {signum}. Shutting down Socket Mode listener cleanly...")
        try:
            client.disconnect()
        except Exception:
            pass
        exit_event.set()

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    try:
        client.connect()
        logger.info("Connected to Slack Socket Mode. Listening for interactive post approval actions...")
        while not exit_event.is_set():
            time.sleep(1)
    except Exception as exc:
        logger.error(f"Fatal error in Socket Mode listener: {exc}")
        sys.exit(1)
    finally:
        logger.info("Socket Mode listener stopped.")


if __name__ == "__main__":
    main()
