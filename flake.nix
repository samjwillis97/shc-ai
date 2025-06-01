{
  description = "SHC - HTTP Client Tools";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };

        node = pkgs.nodejs_22;

      in
      {
        devShells = {
          default = pkgs.mkShell {
            packages = with pkgs; [
              node
              git
            ];
          };
        };
      }
    );
}
