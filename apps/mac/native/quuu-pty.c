#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <libgen.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#include <util.h>

static volatile sig_atomic_t child_pid = -1;
static volatile sig_atomic_t hangup_requested = 0;

static void request_hangup(int signal_number) {
  (void)signal_number;
  hangup_requested = 1;
}

/*
 * A terminal that goes away is a hangup, not a request. Interactive shells ignore SIGTERM by
 * design, so forwarding it left the shell, and this host with it, alive for good after Quuu
 * closed the pane or quit. Hang the shell up the way a real terminal does: SIGHUP to its
 * session and the controlling terminal closed. Whatever ignores even that is killed after a
 * short grace period, so the host always exits and never piles up.
 */
static int hang_up(pid_t pid, int master) {
  int status = 0;
  kill(-pid, SIGHUP);
  kill(pid, SIGHUP);
  close(master);
  for (int waited = 0; waited < 40; waited++) {
    pid_t finished = waitpid(pid, &status, WNOHANG);
    if (finished == pid) return status;
    if (finished < 0 && errno != EINTR) return status;
    usleep(50000);
  }
  kill(-pid, SIGKILL);
  kill(pid, SIGKILL);
  while (waitpid(pid, &status, 0) < 0 && errno == EINTR) {
  }
  return status;
}

static int write_all(int fd, const unsigned char *data, size_t length) {
  size_t written = 0;
  while (written < length) {
    ssize_t count = write(fd, data + written, length - written);
    if (count > 0) {
      written += (size_t)count;
      continue;
    }
    if (count < 0 && errno == EINTR) continue;
    return -1;
  }
  return 0;
}

static unsigned short dimension(const char *value, unsigned short fallback) {
  char *end = NULL;
  long parsed = strtol(value, &end, 10);
  if (end == value || *end != '\0' || parsed < 2 || parsed > 65535) return fallback;
  return (unsigned short)parsed;
}

static void resize_pty(int master, const unsigned char bytes[8]) {
  uint32_t encoded_columns = 0;
  uint32_t encoded_rows = 0;
  memcpy(&encoded_columns, bytes, sizeof(encoded_columns));
  memcpy(&encoded_rows, bytes + sizeof(encoded_columns), sizeof(encoded_rows));
  uint32_t columns = ntohl(encoded_columns);
  uint32_t rows = ntohl(encoded_rows);
  if (columns < 2 || rows < 1 || columns > 65535 || rows > 65535) return;

  struct winsize size = {0};
  size.ws_col = (unsigned short)columns;
  size.ws_row = (unsigned short)rows;
  if (ioctl(master, TIOCSWINSZ, &size) == 0 && child_pid > 0) {
    kill(-child_pid, SIGWINCH);
    kill(child_pid, SIGWINCH);
  }
}

int main(int argc, char **argv) {
  if (argc != 5) {
    fprintf(stderr, "usage: quuu-pty shell cwd columns rows\n");
    return 64;
  }

  struct winsize initial_size = {0};
  initial_size.ws_col = dimension(argv[3], 80);
  initial_size.ws_row = dimension(argv[4], 24);

  int master = -1;
  pid_t pid = forkpty(&master, NULL, NULL, &initial_size);
  if (pid < 0) {
    perror("forkpty");
    return 70;
  }

  if (pid == 0) {
    if (chdir(argv[2]) != 0) {
      perror("chdir");
      _exit(72);
    }
    setenv("TERM", "xterm-256color", 1);
    setenv("COLORTERM", "truecolor", 1);
    setenv("TERM_PROGRAM", "Quuu", 1);
    setenv("TERM_PROGRAM_VERSION", "1", 1);

    char *shell_copy = strdup(argv[1]);
    if (shell_copy == NULL) _exit(71);
    char *name = basename(shell_copy);
    size_t length = strlen(name);
    char *login_name = malloc(length + 2);
    if (login_name == NULL) _exit(71);
    login_name[0] = '-';
    memcpy(login_name + 1, name, length + 1);
    execl(argv[1], login_name, "-l", (char *)NULL);
    perror("exec");
    _exit(72);
  }

  child_pid = pid;
  signal(SIGTERM, request_hangup);
  signal(SIGINT, request_hangup);
  signal(SIGHUP, request_hangup);
  signal(SIGQUIT, request_hangup);
  signal(SIGPIPE, SIG_IGN);

  struct pollfd descriptors[3] = {
      {.fd = STDIN_FILENO, .events = POLLIN},
      {.fd = master, .events = POLLIN},
      {.fd = 3, .events = POLLIN},
  };
  unsigned char input[65536];
  unsigned char control[8];
  size_t control_length = 0;
  int status = 0;
  int hung_up = 0;

  while (1) {
    pid_t finished = waitpid(pid, &status, WNOHANG);
    if (finished == pid) break;
    if (finished < 0 && errno != EINTR) break;

    if (hangup_requested) {
      status = hang_up(pid, master);
      hung_up = 1;
      break;
    }

    int ready = poll(descriptors, 3, 250);
    if (ready < 0) {
      if (errno == EINTR) continue;
      status = hang_up(pid, master);
      hung_up = 1;
      break;
    }

    // Quuu's end of the input pipe closing is the only way it ever goes quiet: the owner is
    // gone (closed the pane, quit, or crashed), so the terminal goes with it.
    if ((descriptors[0].revents & POLLIN) != 0) {
      ssize_t count = read(STDIN_FILENO, input, sizeof(input));
      if (count > 0) write_all(master, input, (size_t)count);
      if (count == 0) hangup_requested = 1;
    } else if ((descriptors[0].revents & (POLLHUP | POLLERR | POLLNVAL)) != 0) {
      hangup_requested = 1;
    }
    if (hangup_requested) continue;

    if ((descriptors[1].revents & POLLIN) != 0) {
      ssize_t count = read(master, input, sizeof(input));
      if (count > 0 && write_all(STDOUT_FILENO, input, (size_t)count) != 0) {
        hangup_requested = 1;
        continue;
      }
    }
    if ((descriptors[1].revents & (POLLHUP | POLLERR | POLLNVAL)) != 0) {
      waitpid(pid, &status, 0);
      break;
    }

    if ((descriptors[2].revents & POLLIN) != 0) {
      ssize_t count = read(3, control + control_length, sizeof(control) - control_length);
      if (count > 0) {
        control_length += (size_t)count;
        if (control_length == sizeof(control)) {
          resize_pty(master, control);
          control_length = 0;
        }
      }
      if (count == 0) descriptors[2].fd = -1;
    }
  }

  if (!hung_up) close(master);
  child_pid = -1;
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return 0;
}
