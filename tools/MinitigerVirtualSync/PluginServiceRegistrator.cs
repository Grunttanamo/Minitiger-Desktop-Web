using Jellyfin.Plugin.MinitigerVirtualSync.ImageFix;
using Jellyfin.Plugin.MinitigerVirtualSync.TrailerDownload;
using Jellyfin.Plugin.MinitigerVirtualSync.TrailerDetection;
using Jellyfin.Plugin.MinitigerVirtualSync.DirectoryUpdate;
using Jellyfin.Plugin.MinitigerVirtualSync.DesktopUpdate;
using Jellyfin.Plugin.MinitigerVirtualSync.Translation;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.MinitigerVirtualSync;

public sealed class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddHttpClient(
            "MinitigerTranslation",
            client =>
            {
                client.BaseAddress = new Uri("https://api.openai.com/v1/");
                client.Timeout = TimeSpan.FromMinutes(5);
            });

        serviceCollection.AddHttpClient(
            MinitigerDesktopUpdateService.HttpClientName,
            client =>
            {
                client.BaseAddress = new Uri("https://api.github.com/");
                client.Timeout = TimeSpan.FromMinutes(15);
                client.DefaultRequestHeaders.UserAgent.ParseAdd(
                    "Minitiger-Virtual-Sync");
            });

        serviceCollection.AddSingleton<MinitigerImageFixService>();
        serviceCollection.AddSingleton<MinitigerTrailerDownloadService>();
        serviceCollection.AddSingleton<MinitigerTrailerDetectionService>();
        serviceCollection.AddSingleton<MinitigerDirectoryUpdateService>();
        serviceCollection.AddSingleton<MinitigerDesktopUpdateService>();

        serviceCollection.AddSingleton<MinitigerTranslationBackgroundService>();
        serviceCollection.AddHostedService<MinitigerTranslationBackgroundService>(provider => provider.GetRequiredService<MinitigerTranslationBackgroundService>());
    }
}

// MINITIGER_PATCH_MARKER: PHASE_18_18_0_PLUGIN_SERVICE_REGISTRATOR
