{
  description = "HttpCraft - HTTP Client Tools";

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

        # Build HttpCraft package
        httpcraft = pkgs.buildNpmPackage {
          pname = "httpcraft";
          version = "1.0.0";

          src = ./.;

          npmDepsHash = "sha256-tmMKAueDLDATyOWMxWnFXYKMJIwPjE3ImEaLP2cohtE=";

          # Build script
          buildPhase = ''
            runHook preBuild
            npm run build
            runHook postBuild
          '';

          # Install script
          installPhase = ''
            runHook preInstall
            
            # Create directories
            mkdir -p $out/bin
            mkdir -p $out/lib/httpcraft
            
            # Copy built files and dependencies
            cp -r dist/* $out/lib/httpcraft/
            cp package.json $out/lib/httpcraft/
            cp -r node_modules $out/lib/httpcraft/
            
            # Create executable wrapper
            cat > $out/bin/httpcraft << EOF
#!/usr/bin/env bash
exec ${node}/bin/node $out/lib/httpcraft/index.js "\$@"
EOF
            chmod +x $out/bin/httpcraft
            
            runHook postInstall
          '';

          meta = {
            description = "A powerful CLI tool for HTTP API testing and automation";
            homepage = "https://github.com/samjwillis97/shc-ai";
            license = pkgs.lib.licenses.isc;
            maintainers = [ ];
          };
        };

      in
      {
        packages = {
          default = httpcraft;
          httpcraft = httpcraft;
        };

        homeManagerModules.httpcraft = ./modules/httpcraft-home.nix;

        devShells = {
          default = pkgs.mkShell {
            packages = with pkgs; [
              node
              git
              # Include our built httpcraft package
              httpcraft
            ];

            # Set up ZSH completions automatically
            shellHook = ''
              # Ensure httpcraft is in PATH (should be automatic with packages above)
              export PATH="${httpcraft}/bin:$PATH"
              
              # Set up ZSH completions if we're in ZSH
              if [ -n "$ZSH_VERSION" ]; then
                echo "Setting up HttpCraft ZSH completions..."
                
                # Create a temporary completion script
                eval "$(httpcraft completion zsh 2>/dev/null || echo '# HttpCraft completion failed')"
                
                echo "HttpCraft is ready! Try:"
                echo "  httpcraft --help"
                echo "  httpcraft completion zsh  # To see the completion script"
                
                # Check if we have a test config
                if [ -f "./test-phase5-demo.yaml" ]; then
                  echo "  httpcraft --get-api-names --config ./test-phase5-demo.yaml  # Test API completion"
                fi
              else
                echo "HttpCraft is ready! (Note: ZSH completions only work in ZSH)"
                echo "Try: httpcraft --help"
              fi
              
              echo "HttpCraft version: $(httpcraft --version 2>/dev/null || echo 'unknown')"
            '';
          };
        };

        # Add checks for testing
        checks = {
          httpcraft-build = httpcraft;
          
          httpcraft-test = pkgs.runCommand "httpcraft-test" {
            buildInputs = [ httpcraft node ];
          } ''
            # Test that httpcraft can run
            httpcraft --version > $out
            
            # Test that completion works
            httpcraft completion zsh > /dev/null
            
            echo "All tests passed!" >> $out
          '';
        };
      }
    );
}
