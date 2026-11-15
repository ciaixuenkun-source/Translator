using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program
{
    private const int Srccopy = 0x00CC0020;
    private const int Captureblt = 0x40000000;
    private const uint DibRgbColors = 0;

    [StructLayout(LayoutKind.Sequential)]
    private struct BitmapInfoHeader
    {
        public uint Size;
        public int Width;
        public int Height;
        public ushort Planes;
        public ushort BitCount;
        public uint Compression;
        public uint SizeImage;
        public int XPelsPerMeter;
        public int YPelsPerMeter;
        public uint ClrUsed;
        public uint ClrImportant;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BitmapInfo
    {
        public BitmapInfoHeader Header;
        public uint Colors;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll")]
    private static extern IntPtr GetWindowDC(IntPtr window);

    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr window, IntPtr dc);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleDC(IntPtr dc);

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateDIBSection(IntPtr dc, ref BitmapInfo info, uint usage,
        out IntPtr bits, IntPtr section, uint offset);

    [DllImport("gdi32.dll")]
    private static extern IntPtr SelectObject(IntPtr dc, IntPtr value);

    [DllImport("gdi32.dll")]
    private static extern bool BitBlt(IntPtr destination, int x, int y, int width, int height,
        IntPtr source, int sourceX, int sourceY, int operation);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr value);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteDC(IntPtr dc);

    private static int Main(string[] args)
    {
        if (args.Length != 4) return 2;
        int x, y, width, height;
        if (!int.TryParse(args[0], out x) || !int.TryParse(args[1], out y) ||
            !int.TryParse(args[2], out width) || !int.TryParse(args[3], out height) ||
            width < 1 || height < 1) return 2;

        SetProcessDPIAware();
        var stopwatch = Stopwatch.StartNew();
        IntPtr desktop = GetDesktopWindow();
        IntPtr source = GetWindowDC(desktop);
        IntPtr memory = IntPtr.Zero;
        IntPtr bitmap = IntPtr.Zero;
        IntPtr previous = IntPtr.Zero;
        try
        {
            memory = CreateCompatibleDC(source);
            var info = new BitmapInfo();
            info.Header.Size = (uint)Marshal.SizeOf(typeof(BitmapInfoHeader));
            info.Header.Width = width;
            info.Header.Height = -height;
            info.Header.Planes = 1;
            info.Header.BitCount = 32;
            info.Header.SizeImage = (uint)(width * height * 4);
            IntPtr bits;
            bitmap = CreateDIBSection(source, ref info, DibRgbColors, out bits, IntPtr.Zero, 0);
            if (memory == IntPtr.Zero || bitmap == IntPtr.Zero) return 3;
            previous = SelectObject(memory, bitmap);
            if (!BitBlt(memory, 0, 0, width, height, source, x, y, Srccopy | Captureblt)) return 4;
            using (var output = Console.OpenStandardOutput())
            {
                var buffer = new byte[Math.Min(width * height * 4, 1024 * 1024)];
                var remaining = width * height * 4;
                var offset = 0;
                while (remaining > 0)
                {
                    var count = Math.Min(buffer.Length, remaining);
                    Marshal.Copy(IntPtr.Add(bits, offset), buffer, 0, count);
                    output.Write(buffer, 0, count);
                    offset += count;
                    remaining -= count;
                }
            }
            stopwatch.Stop();
            Console.Error.WriteLine("captureMs=" + stopwatch.Elapsed.TotalMilliseconds.ToString("F1"));
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.GetType().Name + ": " + error.Message);
            return 5;
        }
        finally
        {
            if (previous != IntPtr.Zero) SelectObject(memory, previous);
            if (bitmap != IntPtr.Zero) DeleteObject(bitmap);
            if (memory != IntPtr.Zero) DeleteDC(memory);
            if (source != IntPtr.Zero) ReleaseDC(desktop, source);
        }
    }
}
