@ECHO OFF
REM vibepm launcher - points to the TS CLI entry (same as dsh.cmd)
REM usage: vibepm web / vibepm status / vibepm --version
@node "%~dp0packages\cli\dist\bin.js" %*
