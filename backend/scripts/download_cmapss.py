"""Download and extract NASA C-MAPSS into backend/data/cmapss."""
import io
import urllib.request
import zipfile

import _path  # noqa: F401
from aeroready.config import CMAPSS_DIR

URL = "https://phm-datasets.s3.amazonaws.com/NASA/6.+Turbofan+Engine+Degradation+Simulation+Data+Set.zip"


def main() -> None:
    if (CMAPSS_DIR / "train_FD001.txt").exists():
        print(f"C-MAPSS already present in {CMAPSS_DIR}")
        return
    CMAPSS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {URL} ...")
    outer = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(URL, timeout=120).read()))
    inner_name = next(n for n in outer.namelist() if n.endswith("CMAPSSData.zip"))
    inner = zipfile.ZipFile(io.BytesIO(outer.read(inner_name)))
    for name in inner.namelist():
        if name.endswith(".txt"):
            (CMAPSS_DIR / name.split("/")[-1]).write_bytes(inner.read(name))
    print(f"Extracted to {CMAPSS_DIR}")


if __name__ == "__main__":
    main()
