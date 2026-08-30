@echo off
REM ChainTrace -- full pipeline runner (Windows).
REM
REM Runs, in order: Person A's data pipeline -> Person B's graph+ML pipeline -> the dashboard.
REM Stops with a clear message (and does NOT launch the dashboard) if either pipeline fails,
REM instead of silently falling through to an empty/broken dashboard.
REM
REM Usage:
REM   run_all.bat                 full dataset, all 49 time steps (slow but real)
REM   run_all.bat 5               subsample to the first 5 time steps (fast iteration/demo prep)
REM
REM Assumes your venv is already activated (see README.md Setup) and the raw datasets are in
REM data\raw\{elliptic,elliptic_pp,geolite2}\ -- run Phase 0 first if you haven't.

setlocal enabledelayedexpansion
set "REPO_ROOT=%~dp0"
cd /d "%REPO_ROOT%"

if "%PYTHON%"=="" set "PYTHON=python"
set "SAMPLE_TIMESTEPS=%~1"

echo === ChainTrace: full pipeline run ===
if not "%SAMPLE_TIMESTEPS%"=="" echo (subsampled to the first %SAMPLE_TIMESTEPS% time steps)

echo.
echo [1/3] Person A: data pipeline -^> data\processed\unified_dataset.csv
if not "%SAMPLE_TIMESTEPS%"=="" (
    %PYTHON% -u -c "from src.data_pipeline.pipeline import main; main(sample_timesteps=%SAMPLE_TIMESTEPS%)"
) else (
    %PYTHON% -u scripts\data_pipeline.py
)
if errorlevel 1 (
    echo.
    echo XXX Data pipeline failed. Stopping before the dashboard launch.
    call :missing_data_help
    exit /b 1
)

echo.
echo [2/3] Person B: graph+ML pipeline -^> outputs\alerts\ranked_alerts.csv
if not "%SAMPLE_TIMESTEPS%"=="" (
    %PYTHON% -u -m src.graph_ml.run_phase2 --sample-timesteps %SAMPLE_TIMESTEPS% --save
) else (
    %PYTHON% -u -m src.graph_ml.run_phase2 --save
)
if errorlevel 1 (
    echo.
    echo XXX Graph+ML pipeline failed. Stopping before the dashboard launch.
    call :missing_data_help
    exit /b 1
)

echo.
echo [3/3] Launching dashboard -^> streamlit run app.py
echo (both outputs above already sit at their default paths, so the dashboard should
echo  auto-load them with no manual upload needed)
%PYTHON% -m streamlit run app.py
goto :eof

:missing_data_help
echo Expected raw data under: %REPO_ROOT%data\raw\
echo   elliptic\       elliptic_txs_features.csv, elliptic_txs_classes.csv, elliptic_txs_edgelist.csv
echo                   (Kaggle Elliptic dataset)
echo   elliptic_pp\    wallets_features.csv, wallets_classes.csv, AddrTx_edgelist.csv, TxAddr_edgelist.csv
echo                   (Elliptic++ -- use the Google Drive link in its README, the GitHub zip only
echo                   ships Git-LFS pointer stubs; check these files are hundreds of MB, not ~130 bytes)
echo   geolite2\       GeoLite2-City-Blocks-IPv4.csv, GeoLite2-City-Locations-en.csv,
echo                   GeoLite2-ASN-Blocks-IPv4.csv (MaxMind GeoLite2 CSV download)
echo See README.md for download links and the full folder layout.
exit /b 0
