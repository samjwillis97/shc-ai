{
  config, lib, pkgs, ...
}:
with lib; let
  cfg = config.programs.httpcraft;
in
{
  options.programs.httpcraft = {
    package = mkPackageOption pkgs "httpcraft" {};

    enable = mkOption {
      type = types.bool;
      default = false;
      description = "Enable httpcraft";
    };

    enableZshIntegration = mkOption {
      type = types.bool;
      default = false;
      description = "Enable Zsh integration";
    };
  };

  config = mkIf cfg.enable {
    home.packages = [ cfg.package ];

    # Zsh integration
    programs.zsh.initContent = mkIf cfg.enableZshIntegration ''
      eval "$(${getExe cfg.package} completion zsh)"
    '';
  };
}