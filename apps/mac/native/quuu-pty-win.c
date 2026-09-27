/*
 * quuu-pty for Windows: the same contract as quuu-pty.c, over ConPTY.
 *
 *   quuu-pty.exe shell cwd columns rows
 *
 * stdin is the terminal's input, stdout its output, and fd 3 carries 8-byte resize frames
 * (columns, rows as big-endian uint32). Quuu closing stdin is a hangup: the console is closed,
 * which sends its programs CTRL_CLOSE, and whatever outlives a short grace period goes with the
 * job object this host keeps them in. The host always exits and never piles up.
 *
 * ConPTY is looked up at run time so an older Windows gets a message, not a loader error.
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <io.h>
#include <shellapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#ifndef PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE
#define PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE 0x00020016
#endif

typedef void *QuuuPseudoConsole;
typedef HRESULT(WINAPI *CreatePseudoConsoleFn)(COORD, HANDLE, HANDLE, DWORD, QuuuPseudoConsole *);
typedef HRESULT(WINAPI *ResizePseudoConsoleFn)(QuuuPseudoConsole, COORD);
typedef void(WINAPI *ClosePseudoConsoleFn)(QuuuPseudoConsole);

static CreatePseudoConsoleFn create_console;
static ResizePseudoConsoleFn resize_console;
static ClosePseudoConsoleFn close_console;

static QuuuPseudoConsole console;
static HANDLE console_input = INVALID_HANDLE_VALUE;
static HANDLE console_output = INVALID_HANDLE_VALUE;
static HANDLE hangup_event;

static SHORT dimension(const wchar_t *value, SHORT fallback) {
  wchar_t *end = NULL;
  long parsed = wcstol(value, &end, 10);
  if (end == value || *end != L'\0' || parsed < 2 || parsed > 32767) return fallback;
  return (SHORT)parsed;
}

static int write_all(HANDLE handle, const char *data, DWORD length) {
  while (length > 0) {
    DWORD written = 0;
    if (!WriteFile(handle, data, length, &written, NULL) || written == 0) return -1;
    data += written;
    length -= written;
  }
  return 0;
}

/* Quuu's end of stdin closing is the only way it ever goes quiet: the owner is gone. */
static DWORD WINAPI pump_input(LPVOID unused) {
  (void)unused;
  HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
  char buffer[65536];
  for (;;) {
    DWORD count = 0;
    if (!ReadFile(in, buffer, sizeof(buffer), &count, NULL) || count == 0) break;
    if (write_all(console_input, buffer, count) != 0) break;
  }
  SetEvent(hangup_event);
  return 0;
}

static DWORD WINAPI pump_output(LPVOID unused) {
  (void)unused;
  HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE);
  char buffer[65536];
  for (;;) {
    DWORD count = 0;
    if (!ReadFile(console_output, buffer, sizeof(buffer), &count, NULL) || count == 0) break;
    if (write_all(out, buffer, count) != 0) {
      SetEvent(hangup_event);
      break;
    }
  }
  return 0;
}

static DWORD WINAPI pump_control(LPVOID unused) {
  (void)unused;
  intptr_t raw = _get_osfhandle(3);
  if (raw == -1) return 0;
  HANDLE control = (HANDLE)raw;
  unsigned char frame[8];
  DWORD filled = 0;
  for (;;) {
    DWORD count = 0;
    if (!ReadFile(control, frame + filled, sizeof(frame) - filled, &count, NULL) || count == 0) break;
    filled += count;
    if (filled < sizeof(frame)) continue;
    filled = 0;
    unsigned long columns = ((unsigned long)frame[0] << 24) | ((unsigned long)frame[1] << 16) |
                            ((unsigned long)frame[2] << 8) | frame[3];
    unsigned long rows = ((unsigned long)frame[4] << 24) | ((unsigned long)frame[5] << 16) |
                         ((unsigned long)frame[6] << 8) | frame[7];
    if (columns < 2 || rows < 1 || columns > 32767 || rows > 32767) continue;
    COORD size = {(SHORT)columns, (SHORT)rows};
    resize_console(console, size);
  }
  return 0;
}

static wchar_t *quoted(const wchar_t *value) {
  size_t length = wcslen(value);
  wchar_t *line = malloc((length + 3) * sizeof(wchar_t));
  if (line == NULL) return NULL;
  line[0] = L'"';
  memcpy(line + 1, value, length * sizeof(wchar_t));
  line[length + 1] = L'"';
  line[length + 2] = L'\0';
  return line;
}

static int fail(const char *what) {
  fprintf(stderr, "quuu-pty: %s failed (%lu)\n", what, (unsigned long)GetLastError());
  return 70;
}

int main(void) {
  int argc = 0;
  wchar_t **argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  if (argv == NULL || argc != 5) {
    fprintf(stderr, "usage: quuu-pty shell cwd columns rows\n");
    return 64;
  }

  HMODULE kernel = GetModuleHandleW(L"kernel32.dll");
  create_console = (CreatePseudoConsoleFn)(void *)GetProcAddress(kernel, "CreatePseudoConsole");
  resize_console = (ResizePseudoConsoleFn)(void *)GetProcAddress(kernel, "ResizePseudoConsole");
  close_console = (ClosePseudoConsoleFn)(void *)GetProcAddress(kernel, "ClosePseudoConsole");
  if (create_console == NULL || resize_console == NULL || close_console == NULL) {
    fprintf(stderr, "quuu-pty: this Windows has no pseudo console (Windows 10 1809 or later is required)\n");
    return 69;
  }

  HANDLE pty_input = INVALID_HANDLE_VALUE;
  HANDLE pty_output = INVALID_HANDLE_VALUE;
  if (!CreatePipe(&pty_input, &console_input, NULL, 0)) return fail("CreatePipe");
  if (!CreatePipe(&console_output, &pty_output, NULL, 0)) return fail("CreatePipe");

  COORD size = {dimension(argv[3], 80), dimension(argv[4], 24)};
  if (FAILED(create_console(size, pty_input, pty_output, 0, &console))) return fail("CreatePseudoConsole");
  // The console holds its own copies; keeping ours would keep the output pipe open forever.
  CloseHandle(pty_input);
  CloseHandle(pty_output);

  SetEnvironmentVariableW(L"TERM", L"xterm-256color");
  SetEnvironmentVariableW(L"COLORTERM", L"truecolor");
  SetEnvironmentVariableW(L"TERM_PROGRAM", L"Quuu");
  SetEnvironmentVariableW(L"TERM_PROGRAM_VERSION", L"1");

  SIZE_T attributes_size = 0;
  InitializeProcThreadAttributeList(NULL, 1, 0, &attributes_size);
  STARTUPINFOEXW startup;
  ZeroMemory(&startup, sizeof(startup));
  startup.StartupInfo.cb = sizeof(startup);
  startup.lpAttributeList = (LPPROC_THREAD_ATTRIBUTE_LIST)malloc(attributes_size);
  if (startup.lpAttributeList == NULL) return fail("malloc");
  if (!InitializeProcThreadAttributeList(startup.lpAttributeList, 1, 0, &attributes_size)) {
    return fail("InitializeProcThreadAttributeList");
  }
  if (!UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, console,
                                 sizeof(console), NULL, NULL)) {
    return fail("UpdateProcThreadAttribute");
  }

  // Everything the shell starts stays in this job, and the job dies with the host.
  HANDLE job = CreateJobObjectW(NULL, NULL);
  if (job != NULL) {
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
    ZeroMemory(&limits, sizeof(limits));
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits));
  }

  wchar_t *command_line = quoted(argv[1]);
  if (command_line == NULL) return fail("malloc");
  PROCESS_INFORMATION process;
  ZeroMemory(&process, sizeof(process));
  if (!CreateProcessW(NULL, command_line, NULL, NULL, FALSE, EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED,
                      NULL, argv[2], &startup.StartupInfo, &process)) {
    DWORD error = GetLastError();
    fprintf(stderr, "quuu-pty: cannot start %ls (%lu)\n", argv[1], (unsigned long)error);
    return 72;
  }
  if (job != NULL) AssignProcessToJobObject(job, process.hProcess);
  ResumeThread(process.hThread);
  CloseHandle(process.hThread);

  hangup_event = CreateEventW(NULL, TRUE, FALSE, NULL);
  HANDLE output_thread = CreateThread(NULL, 0, pump_output, NULL, 0, NULL);
  CreateThread(NULL, 0, pump_input, NULL, 0, NULL);
  CreateThread(NULL, 0, pump_control, NULL, 0, NULL);

  HANDLE waits[2] = {process.hProcess, hangup_event};
  DWORD which = WaitForMultipleObjects(2, waits, FALSE, INFINITE);
  DWORD exit_code = 0;
  if (which == WAIT_OBJECT_0) {
    GetExitCodeProcess(process.hProcess, &exit_code);
    // Closing the console ends the output pipe once what the shell last wrote has been read.
    close_console(console);
    WaitForSingleObject(output_thread, 2000);
  } else {
    // A hangup: close the console the way a terminal window closing does, then make sure.
    close_console(console);
    if (WaitForSingleObject(process.hProcess, 2000) != WAIT_OBJECT_0) {
      if (job != NULL) TerminateJobObject(job, 1);
      TerminateProcess(process.hProcess, 1);
    }
    GetExitCodeProcess(process.hProcess, &exit_code);
  }
  if (job != NULL) CloseHandle(job);
  return (int)exit_code;
}
