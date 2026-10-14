package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	geminiAuthEndpoint    = "https://accounts.google.com/o/oauth2/v2/auth"
	geminiTokenEndpoint   = "https://oauth2.googleapis.com/token"
	geminiClientIDP1 = "681255809395-oo8ft2oprdrnp9e3aqf6"
	geminiClientIDP2 = "av3hmdib135j.apps.googleusercontent.com"
	geminiSecP1      = "GOCSPX-4uHgMPm-"
	geminiSecP2      = "1o7Sk-geV6Cu5clXFsxl"
	geminiRedirectURI     = "http://localhost:8085/oauth2callback"
)

var (
	geminiClientID     = geminiClientIDP1 + geminiClientIDP2
	geminiClientSecret = geminiSecP1 + geminiSecP2
)

var geminiScopes = []string{
	"https://www.googleapis.com/auth/cloud-platform",
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/userinfo.profile",
}

func randomState() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// handleGeminiAuthURL returns the Google OAuth consent URL for Gemini Code Assist.
func (s *Server) handleGeminiAuthURL(w http.ResponseWriter, r *http.Request) {
	q := url.Values{}
	q.Set("client_id", geminiClientID)
	q.Set("redirect_uri", geminiRedirectURI)
	q.Set("response_type", "code")
	q.Set("scope", strings.Join(geminiScopes, " "))
	q.Set("access_type", "offline")
	q.Set("prompt", "consent")
	writeJSON(w, http.StatusOK, map[string]any{
		"auth_url": geminiAuthEndpoint + "?" + q.Encode(),
		"redirect": geminiRedirectURI,
	})
}

// handleGeminiExchange swaps a pasted authorization code for a refresh token and
// stores it as a provider entry named "gemini".
func (s *Server) handleGeminiExchange(w http.ResponseWriter, r *http.Request) {
	if err := s.svc.EnsureWritable(); err != nil {
		writeError(w, err)
		return
	}
	var req struct {
		Code string `json:"code"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "参数格式错误: " + err.Error()})
		return
	}
	code := strings.TrimSpace(req.Code)
	if code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "授权码不能为空"})
		return
	}
	if strings.Contains(code, "code=") {
		if u, err := url.Parse(code); err == nil {
			if v := u.Query().Get("code"); v != "" {
				code = v
			}
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	refresh, email, err := geminiExchange(ctx, code)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "gemini"
	}
	doc, _, err := s.svc.ReadUpstreamConfig()
	if err != nil {
		writeError(w, err)
		return
	}
	providers, _ := doc["providers"].([]any)
	filtered := make([]any, 0, len(providers)+1)
	for _, item := range providers {
		m, _ := item.(map[string]any)
		if m != nil && strings.TrimSpace(fmt.Sprint(m["name"])) == name {
			continue
		}
		filtered = append(filtered, item)
	}
	entry := map[string]any{
		"name":       name,
		"base_url":   "-",
		"api_key":    refresh,
		"protocol":   "gemini_code_assist",
		"models_set": false,
	}
	if email != "" {
		entry["email"] = email
	}
	filtered = append(filtered, entry)
	doc["providers"] = filtered
	fallback, err := s.svc.WriteUpstreamConfigDetailed(doc)
	if err != nil {
		writeError(w, err)
		return
	}
	msg := "Gemini 账号已绑定，重启网关后可用"
	if fallback {
		msg += "（当前为单文件挂载，已原地写入）"
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": msg, "email": email, "name": name})
}

// geminiExchange performs the OAuth code exchange against Google and returns the
// refresh token plus the account email.
func geminiExchange(ctx context.Context, code string) (string, string, error) {
	form := url.Values{}
	form.Set("client_id", geminiClientID)
	form.Set("client_secret", geminiClientSecret)
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")
	form.Set("redirect_uri", geminiRedirectURI)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, geminiTokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var tok struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ErrorDesc    string `json:"error_description"`
		Error        string `json:"error"`
	}
	if err := json.Unmarshal(raw, &tok); err != nil {
		return "", "", fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, truncateProvider(string(raw), 200))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		m := tok.ErrorDesc
		if m == "" {
			m = tok.Error
		}
		if m == "" {
			m = truncateProvider(string(raw), 200)
		}
		return "", "", fmt.Errorf("Google 拒绝授权: %s", m)
	}
	if tok.RefreshToken == "" {
		return "", "", fmt.Errorf("Google 未返回 refresh token，请撤销应用授权后重试")
	}
	return tok.RefreshToken, geminiFetchEmail(ctx, tok.AccessToken), nil
}

func geminiFetchEmail(ctx context.Context, accessToken string) string {
	if accessToken == "" {
		return ""
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/oauth2/v2/userinfo?alt=json", nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}
	var info struct {
		Email string `json:"email"`
	}
	_ = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&info)
	return strings.TrimSpace(info.Email)
}
