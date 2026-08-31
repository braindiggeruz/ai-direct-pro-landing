"""Manual, bounded entry point. Importing this package performs no network I/O."""

import argparse
import sys
from pathlib import Path

from .client import ApiClient, ApiError, run_once
from .extractor import ExtractorError
from .state import StateStore
from .transport import FetchError


def main() -> int:
    parser = argparse.ArgumentParser(description="Isolated Lead Radar collector: one bounded job, no message sending")
    parser.add_argument("--once", action="store_true", help="explicitly claim at most one job and then exit")
    parser.add_argument("--state", type=Path, default=Path(__file__).resolve().parents[1] / ".collector-state" / "state.sqlite3")
    args = parser.parse_args()
    if not args.once:
        parser.error("--once is required; no implicit background loop")
    store = None
    try:
        api = ApiClient.from_environment()  # validates config before creating local state
        store = StateStore(args.state)
        print(run_once(store, api))  # no HTML, contact data, token, source URL or response dump
        return 0
    except (ValueError, ApiError, FetchError) as exc:
        print(exc.code if isinstance(exc, (ApiError, ExtractorError)) else "collector_configuration_invalid", file=sys.stderr)
        return 2
    finally:
        if store:
            store.close()


if __name__ == "__main__":
    raise SystemExit(main())
