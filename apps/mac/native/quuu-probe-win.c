/*
 * quuu-probe for Windows: the two process facts macOS answers with stock tools.
 *
 *   quuu-probe.exe start-time <pid>   prints when the process started, in ms since the Unix epoch
 *                                     (what `ps -o lstart=` answers); exit 1 when there is none
 *   quuu-probe.exe lock-held <path>   exits 75 when another process holds an exclusive lock on the
 *                                     file, 0 when it is free (what `lockf -k -n -t 0` answers)
 *
 * Neither has a Node API, and PowerShell takes most of a second to start: too slow for a probe
 * that runs on every liveness pass.
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>

/* sysexits.h EX_TEMPFAIL, the same answer lockf(1) gives for a held lock. */
#define HELD 75

static int start_time(const wchar_t *value) {
  wchar_t *end = NULL;
  unsigned long pid = wcstoul(value, &end, 10);
  if (end == value || *end != L'\0' || pid == 0) return 64;
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, (DWORD)pid);
  if (process == NULL) return 1;
  FILETIME created, exited, kernel, user;
  DWORD code = STILL_ACTIVE;
  BOOL ok = GetProcessTimes(process, &created, &exited, &kernel, &user) && GetExitCodeProcess(process, &code);
  CloseHandle(process);
  // A handle can outlive the process it names; an exited one has no start to compare.
  if (!ok || code != STILL_ACTIVE) return 1;
  ULARGE_INTEGER ticks;
  ticks.LowPart = created.dwLowDateTime;
  ticks.HighPart = created.dwHighDateTime;
  // FILETIME counts 100ns from 1601-01-01; the Unix epoch is 11644473600 seconds later.
  unsigned long long ms = ticks.QuadPart / 10000ULL - 11644473600000ULL;
  printf("%llu\n", ms);
  return 0;
}

static int lock_held(const wchar_t *path) {
  HANDLE file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL,
                            OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  if (file == INVALID_HANDLE_VALUE) return GetLastError() == ERROR_SHARING_VIOLATION ? HELD : 1;
  // The whole range, which is what a Rust `File::try_lock` (and fs2) takes on Windows.
  OVERLAPPED at;
  ZeroMemory(&at, sizeof(at));
  int answer = 0;
  if (LockFileEx(file, LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY, 0, MAXDWORD, MAXDWORD, &at)) {
    UnlockFileEx(file, 0, MAXDWORD, MAXDWORD, &at);
  } else {
    answer = GetLastError() == ERROR_LOCK_VIOLATION ? HELD : 1;
  }
  CloseHandle(file);
  return answer;
}

int main(void) {
  int argc = 0;
  wchar_t **argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  if (argv != NULL && argc == 3 && wcscmp(argv[1], L"start-time") == 0) return start_time(argv[2]);
  if (argv != NULL && argc == 3 && wcscmp(argv[1], L"lock-held") == 0) return lock_held(argv[2]);
  fprintf(stderr, "usage: quuu-probe start-time <pid> | lock-held <path>\n");
  return 64;
}
