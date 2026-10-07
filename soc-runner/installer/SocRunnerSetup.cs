// SOCRunnerSetup.exe (ADR 0008, ticket 16). Built by build.py with the csc
// that ships with Windows (.NET Framework 4.x, C# 5), so nothing else is
// needed to build or run it.
//
// The payload (bundled Python + the runner) is an embedded resource. The
// server appends the downloading user's runner config to this file:
//   <exe> <config JSON> <JSON length: uint32 LE> "SOCRCFG1"
// (lib/soc-runner-installer.ts). The stub, without admin rights:
//   1. stops a runner already running from %LOCALAPPDATA%\SOCRunner\app
//      (with its `claude` child), so its files can be replaced;
//   2. unpacks the payload into a fresh app folder (that is the repair);
//   3. writes the config to soc-runner.json;
//   4. runs app\python\python.exe app\runner\install.py <root>, which
//      installs Claude Code, registers autostart, opens the sign-in once and
//      starts the runner (soc-runner/install.py).
// The work folder (paused checks) and the log are kept.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

static class SocRunnerSetup
{
    const string Magic = "SOCRCFG1";
    const string Title = "ติดตั้ง SOC Runner";

    [STAThread]
    static int Main()
    {
        try { Console.OutputEncoding = Encoding.UTF8; } catch (IOException) { }
        string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SOCRunner");
        try
        {
            byte[] config = ReadConfig(Assembly.GetEntryAssembly().Location);
            if (config == null)
            {
                return Fail("ตัวติดตั้งนี้ไม่มีไฟล์เชื่อมของคุณ ให้ดาวน์โหลดตัวติดตั้งจากหน้า /soc บนเว็บไซต์");
            }
            Directory.CreateDirectory(root);
            Say("กำลังปิด SOC Runner ตัวเดิม (ถ้ามี)…");
            StopRunner(root);
            Say("กำลังแตกไฟล์ไปที่ " + root + " …");
            Unpack(root);
            File.WriteAllBytes(Path.Combine(root, "soc-runner.json"), config);
            int code = RunInstall(root);
            if (code != 0)
            {
                return Fail("ติดตั้งไม่สำเร็จ ดูเหตุผลในหน้าต่างสีดำ แล้วลองติดตั้งใหม่อีกครั้ง");
            }
            Say("ติดตั้งเสร็จแล้ว");
            MessageBox.Show("ติดตั้ง SOC Runner เสร็จแล้ว\n\nSOC Runner ทำงานอยู่เบื้องหลังและจะเริ่มเองทุกครั้งที่เข้า Windows\nกลับไปที่หน้า /soc บนเว็บไซต์ได้เลย\n\nลบไฟล์ SOCRunnerSetup.exe ที่ดาวน์โหลดไว้ทิ้งได้ ไฟล์นั้นมีรหัสเชื่อมของคุณ",
                Title, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return Fail("ติดตั้งไม่สำเร็จ: " + error.Message);
        }
    }

    static void Say(string message)
    {
        Console.WriteLine(message);
    }

    static int Fail(string message)
    {
        Console.Error.WriteLine(message);
        MessageBox.Show(message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
        return 1;
    }

    // The config JSON appended by the server, or null if this copy has none.
    static byte[] ReadConfig(string exePath)
    {
        using (FileStream file = File.OpenRead(exePath))
        {
            int trailer = 4 + Magic.Length;
            if (file.Length < trailer) return null;
            byte[] tail = new byte[trailer];
            file.Seek(-trailer, SeekOrigin.End);
            ReadExactly(file, tail);
            if (Encoding.ASCII.GetString(tail, 4, Magic.Length) != Magic) return null;
            long length = BitConverter.ToUInt32(tail, 0);
            if (length == 0 || length > file.Length - trailer || length > 1024 * 1024) return null;
            byte[] json = new byte[length];
            file.Seek(-trailer - length, SeekOrigin.End);
            ReadExactly(file, json);
            return json;
        }
    }

    static void ReadExactly(Stream stream, byte[] buffer)
    {
        int done = 0;
        while (done < buffer.Length)
        {
            int read = stream.Read(buffer, done, buffer.Length - done);
            if (read <= 0) throw new EndOfStreamException();
            done += read;
        }
    }

    // Kills every python(w)/SOCRunner started from <root>\app, with its process tree
    // (a check in progress runs `claude` under it, on the reviewer's quota).
    static void StopRunner(string root)
    {
        string app = Path.Combine(root, "app") + Path.DirectorySeparatorChar;
        foreach (Process process in Process.GetProcesses())
        {
            try
            {
                string name = process.ProcessName.ToLowerInvariant();
                if (name != "python" && name != "pythonw" && name != "socrunner") continue;
                string path = process.MainModule.FileName;
                if (!path.StartsWith(app, StringComparison.OrdinalIgnoreCase)) continue;
                using (Process kill = Process.Start(new ProcessStartInfo("taskkill", "/PID " + process.Id + " /T /F")
                {
                    UseShellExecute = false, CreateNoWindow = true,
                }))
                {
                    kill.WaitForExit(15000);
                }
                process.WaitForExit(15000);
            }
            catch (Exception)
            {
                // Another user's process, or one that just exited.
            }
            finally
            {
                process.Dispose();
            }
        }
    }

    // A fresh app folder every time: whatever was broken in the old one is gone.
    static void Unpack(string root)
    {
        string app = Path.Combine(root, "app");
        string fresh = Path.Combine(root, "app.new");
        DeleteQuietly(fresh);
        foreach (string old in Directory.GetDirectories(root, "app.old-*")) DeleteQuietly(old);
        using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
        {
            if (payload == null) throw new InvalidOperationException("ตัวติดตั้งไม่มี payload.zip (build ไม่สมบูรณ์)");
            using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read))
            {
                archive.ExtractToDirectory(fresh);
            }
        }
        if (Directory.Exists(app))
        {
            string old = Path.Combine(root, "app.old-" + DateTime.Now.Ticks);
            try
            {
                Directory.Move(app, old);
            }
            catch (IOException)
            {
                throw new IOException("ไฟล์ของ SOC Runner ตัวเดิมยังถูกใช้งานอยู่ ให้รีสตาร์ทเครื่องแล้วติดตั้งใหม่");
            }
            DeleteQuietly(old);
        }
        Directory.Move(fresh, app);
    }

    static void DeleteQuietly(string path)
    {
        try
        {
            if (Directory.Exists(path)) Directory.Delete(path, true);
        }
        catch (Exception)
        {
            // Left for the next install to remove.
        }
    }

    static int RunInstall(string root)
    {
        string python = Path.Combine(root, @"app\python\python.exe");
        string script = Path.Combine(root, @"app\runner\install.py");
        ProcessStartInfo info = new ProcessStartInfo(python, Quote(script) + " " + Quote(root))
        {
            UseShellExecute = false,
            WorkingDirectory = root,
        };
        info.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
        info.EnvironmentVariables["PYTHONUTF8"] = "1";
        using (Process process = Process.Start(info))
        {
            process.WaitForExit();
            return process.ExitCode;
        }
    }

    static string Quote(string value)
    {
        // A path never ends in a backslash here, so no escaping rules beyond quotes apply.
        return "\"" + value + "\"";
    }
}
