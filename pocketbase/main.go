package main

import (
	"log"
	"os"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

func main() {
	app := pocketbase.New()

	jsvm.MustRegister(app, jsvm.Config{HooksWatch: false})
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{Automigrate: false})

	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		e.Router.GET("/*", apis.StaticDirectoryHandler(os.DirFS("./pb_public"), true))
		return nil
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
	_ = echo.New
}
