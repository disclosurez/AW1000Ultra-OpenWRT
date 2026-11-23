package main

import "crypto/tls"

// insecureTLS is used only when the config asks to skip verification (a
// self-signed HTTPS tunnel endpoint, for example).
func insecureTLS() *tls.Config {
	return &tls.Config{InsecureSkipVerify: true} //nolint:gosec
}
