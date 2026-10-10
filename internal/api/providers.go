package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type providerConfig struct {
	Name      string `json:"name"`
	BaseURL   string `json:"base_url"`
	APIKey    string `json:"api_key"`
	Protocol  string `json:"protocol,omitempty"`
	ModelsURL string `json:"models_url,omitempty"`
}

type providerModel struct {
	ID      string `json:"id"`
	Name    string `json:"name,omitempty"`
	OwnedBy string `json:"owned_by,omitempty"`
}

func normalizeProviderProtocol(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "responses", "response", "responses_api":
		return "responses"
	default:
		return "chat_completions"
	}
}

func normalizeProviders(raw any) []providerConfig {
	list, _ := raw.([]any)
	out := make([]providerConfig, 0, len(list))
	for _, item := range list {
		m, _ := item.(map[string]any)
		if m == nil {
			continue
		}
		p := providerConfig{
			Name:      strings.TrimSpace(fmt.Sprint(m["name"])),
			BaseURL:   strings.TrimRight(strings.TrimSpace(fmt.Sprint(m["base_url"])), "/"),
			APIKey:    strings.TrimSpace(fmt.Sprint(m["api_key"])),
			Protocol:  normalizeProviderProtocol(fmt.Sprint(m["protocol"])),
			ModelsURL: strings.TrimRight(strings.TrimSpace(fmt.Sprint(m["models_url"])), "/"),
		}
		if p.Name == "" || p.BaseURL == "" {
			continue
		}
		out = append(out, p)
	}
	return out
}

func (s *Server) handleProvidersGet(w http.ResponseWriter, r *http.Request) {
	doc, _, err := s.svc.ReadUpstreamConfig()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"providers": normalizeProviders(doc["providers"])})
}

func (s *Server) handleProvidersPut(w http.ResponseWriter, r *http.Request) {
	if err := s.svc.EnsureWritable(); err != nil {
		writeError(w, err)
		return
	}
	var req struct {
		Providers []providerConfig `json:"providers"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "供应商配置格式错误: " + err.Error()})
		return
	}
	doc, _, err := s.svc.ReadUpstreamConfig()
	if err != nil {
		writeError(w, err)
		return
	}
	clean := make([]providerConfig, 0, len(req.Providers))
	seen := map[string]bool{}
	for _, p := range req.Providers {
		p.Name = strings.TrimSpace(p.Name)
		p.BaseURL = strings.TrimRight(strings.TrimSpace(p.BaseURL), "/")
		p.APIKey = strings.TrimSpace(p.APIKey)
		p.ModelsURL = strings.TrimRight(strings.TrimSpace(p.ModelsURL), "/")
		p.Protocol = normalizeProviderProtocol(p.Protocol)
		if p.Name == "" || p.BaseURL == "" {
			continue
		}
		if seen[p.Name] {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "供应商名称重复: " + p.Name})
			return
		}
		if _, err := url.ParseRequestURI(p.BaseURL); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Base URL 非法: " + p.BaseURL})
			return
		}
		seen[p.Name] = true
		clean = append(clean, p)
	}
	doc["providers"] = clean
	fallback, err := s.svc.WriteUpstreamConfigDetailed(doc)
	if err != nil {
		writeError(w, err)
		return
	}
	msg := "供应商配置已保存，重启网关后生效"
	if fallback {
		msg += "（当前为单文件挂载，已原地写入）"
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": msg, "providers": clean})
}

func (s *Server) handleProviderTest(w http.ResponseWriter, r *http.Request) {
	var req struct {
		providerConfig
		TestModel string `json:"test_model"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "参数格式错误: " + err.Error()})
		return
	}
	models, err := fetchProviderModels(r.Context(), req.providerConfig)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	msg := fmt.Sprintf("连接成功，模型列表接口返回 %d 个模型", len(models))
	if strings.TrimSpace(req.TestModel) != "" {
		if err := testProviderModel(r.Context(), req.providerConfig, strings.TrimSpace(req.TestModel)); err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": "模型调用失败: " + err.Error()})
			return
		}
		msg = fmt.Sprintf("连接成功，测试模型 %s 调用成功", req.TestModel)
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": msg})
}

func testProviderModel(ctx context.Context, p providerConfig, model string) error {
	proto := normalizeProviderProtocol(p.Protocol)
	endpoint := strings.TrimRight(p.BaseURL, "/") + "/chat/completions"
	payload := map[string]any{"model": model, "messages": []any{map[string]any{"role": "user", "content": "ping"}}, "stream": false}
	if proto == "responses" {
		endpoint = strings.TrimRight(p.BaseURL, "/") + "/responses"
		payload = map[string]any{"model": model, "input": "ping"}
	}
	raw, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(raw)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if p.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.APIKey)
	}
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, truncateProvider(string(body), 300))
	}
	return nil
}
func (s *Server) handleProviderModels(w http.ResponseWriter, r *http.Request) {
	var req providerConfig
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "参数格式错误: " + err.Error()})
		return
	}
	models, err := fetchProviderModels(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": models, "count": len(models)})
}

func fetchProviderModels(ctx context.Context, p providerConfig) ([]providerModel, error) {
	if strings.TrimSpace(p.BaseURL) == "" {
		return nil, fmt.Errorf("Base URL 不能为空")
	}
	endpoint := strings.TrimSpace(p.ModelsURL)
	if endpoint == "" {
		endpoint = strings.TrimRight(p.BaseURL, "/") + "/models"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if p.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.APIKey)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("模型接口 HTTP %d: %s", resp.StatusCode, truncateProvider(string(raw), 300))
	}
	var env struct {
		Data   []providerModel `json:"data"`
		Models []providerModel `json:"models"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return nil, fmt.Errorf("解析模型列表失败: %w", err)
	}
	out := env.Data
	if len(out) == 0 {
		out = env.Models
	}
	if out == nil {
		out = []providerModel{}
	}
	return out, nil
}

func truncateProvider(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n]
}
