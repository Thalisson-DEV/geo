import { Component, computed, inject, input, output, signal, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { PopoverModule, Popover } from 'primeng/popover';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../../core/services/auth.service';
import { NavigationEnd, RouterLink, Router } from "@angular/router";
import { ChangePasswordDialogComponent } from '../change-password-dialog/change-password-dialog.component';
import { FavoritosService } from '../../../core/services/favoritos.service';
import {
  GeoDensidadePreferida,
  GeoReduzirMovimento,
  GeoTema,
  ThemeService
} from '../../../core/services/theme.service';
import { GeoIconButtonComponent, GeoIconComponent, GeoLogoComponent, GeoShortcutsPreference } from '@geo/ui';
import { GeoTrechoDaTrilha, GeoTrilhaDaPagina } from '@geo/ui/patterns';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { NotificacoesStore } from '../../../core/services/notificacoes-store.service';
import { ConnectivityService } from '../../../core/services/connectivity.service';
import { MenuItem, MessageService } from 'primeng/api';
import { AvaliacaoConviteService } from '../../../core/services/avaliacao-convite.service';
import { NotificacoesPanelComponent } from '../notificacoes-panel/notificacoes-panel.component';
import { BuscaTelasComponent } from '../busca-telas/busca-telas.component';
import { ViewStateStore } from '../../../core/navigation/view-state.store';

@Component({
  selector: 'app-header',
  styles: [`
    .geo-topo { position: relative; z-index: 30; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex: none; block-size: var(--geo-nav-topbar-height); padding-inline: 16px; background: var(--geo-surface); border-block-end: 1px solid var(--geo-border); color: var(--geo-foreground); }
    @media (min-width: 1024px) { .geo-topo { padding-inline: 1.5rem; } }
    .geo-topo__inicio { display: flex; align-items: center; gap: 0.5rem; min-inline-size: 0; }
    .geo-topo__marca { display: inline-flex; }
    .geo-topo__trilha { display: flex; align-items: center; gap: 0.35rem; min-inline-size: 0; color: var(--geo-foreground-subtle); font-size: var(--geo-text-body-sm); white-space: nowrap; overflow: hidden; }
    .geo-topo__trilha > span { overflow: hidden; text-overflow: ellipsis; }
    .geo-topo__trilha-link { flex: none; border-radius: var(--geo-radius-sm); color: inherit; text-decoration: none; }
    .geo-topo__trilha-link:hover { color: var(--geo-brand-text); text-decoration: underline; }
    .geo-topo__trilha-link:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    .geo-topo__trilha-atual { color: var(--geo-foreground); font-weight: var(--geo-font-weight-semibold); }
    .geo-topo__trilha-sep { color: var(--geo-border-strong); }
    @media (max-width: 639px) { .geo-topo__trilha { display: none; } }
    .geo-topo__acoes { display: flex; align-items: center; gap: 0.25rem; }
    .geo-topo__notificacoes { position: relative; display: inline-flex; }
    .geo-topo__contador { position: absolute; inset-block-start: 0.1rem; inset-inline-end: 0.1rem; min-inline-size: 1.05rem; block-size: 1.05rem; padding-inline: 0.25rem; border-radius: var(--geo-radius-full); background: var(--geo-accent); color: var(--geo-surface-inverse); font-size: var(--geo-font-caption); font-weight: var(--geo-font-weight-bold); line-height: 1.05rem; text-align: center; box-shadow: 0 0 0 2px var(--geo-surface); pointer-events: none; }
    .geo-topo__conta { display: inline-flex; align-items: center; justify-content: center; inline-size: 2.25rem; block-size: 2.25rem; margin-inline-start: 0.25rem; padding: 0; border: 0; border-radius: var(--geo-radius-full); background: transparent; cursor: pointer; }
    .geo-topo__conta:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    .geo-topo__avatar { display: inline-flex; align-items: center; justify-content: center; inline-size: 2rem; block-size: 2rem; border-radius: var(--geo-radius-full); background: var(--geo-brand-soft); color: var(--geo-brand-text); font-size: var(--geo-text-label); font-weight: var(--geo-font-weight-bold); transition: box-shadow var(--geo-motion-fast) var(--geo-ease-out); }
    .geo-topo__conta:hover .geo-topo__avatar { box-shadow: 0 0 0 2px var(--geo-border-strong); }
    .geo-pref-grupo { border: 0; margin: 0 0 0.75rem; padding: 0; min-width: 0; }
    .geo-pref-rotulo { font-size: var(--geo-text-caption); font-weight: var(--geo-font-weight-semibold); color: var(--geo-foreground-muted); margin-bottom: 0.375rem; padding: 0 0.25rem; }
    .geo-pref-opcoes { display: grid; grid-auto-columns: 1fr; grid-auto-flow: column; gap: 2px; padding: 2px; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); }
    .geo-pref-opcao { display: inline-flex; align-items: center; justify-content: center; gap: 0.375rem; min-height: var(--geo-control-height-sm); padding: 0 0.5rem; border: 0; border-radius: var(--geo-radius-sm); background: transparent; color: var(--geo-foreground-muted); font: inherit; font-size: var(--geo-text-label); font-weight: var(--geo-font-weight-medium); cursor: pointer; transition: background-color var(--geo-motion-fast) var(--geo-ease-out), color var(--geo-motion-fast) var(--geo-ease-out); }
    .geo-pref-opcao:hover { color: var(--geo-foreground); }
    .geo-pref-opcao[aria-checked='true'] { background: var(--geo-surface); color: var(--geo-foreground); box-shadow: var(--geo-elevation-1); }
  `],
  standalone: true,
  imports: [CommonModule, GeoIconButtonComponent, GeoIconComponent, GeoLogoComponent, ButtonModule, AvatarModule, PopoverModule, DialogModule, TooltipModule, RouterLink, ChangePasswordDialogComponent, NotificacoesPanelComponent, BuscaTelasComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <header class="geo-topo">
      <div class="geo-topo__inicio">
        @if (isMobile()) {
          <geo-icon-button icon="menu" label="Abrir menu" (pressed)="toggleMenu.emit()"></geo-icon-button>
          <a routerLink="/home" class="geo-topo__marca" aria-label="GEO, ir para o início">
            <geo-logo size="1.75rem" label="GEO" />
          </a>
        }
        <nav class="geo-topo__trilha" aria-label="Você está em">
          @for (parte of trilha(); track $index; let ultimo = $last) {
            @if (ultimo) {
              <span aria-current="page" class="geo-topo__trilha-atual">{{ parte.label }}</span>
            } @else if (parte.route) {
              <a class="geo-topo__trilha-link" [routerLink]="parte.route" [queryParams]="parte.queryParams ?? null">{{ parte.label }}</a>
            } @else {
              <span>{{ parte.label }}</span>
            }
            @if (!ultimo) { <geo-icon name="chevron-right" size="sm" class="geo-topo__trilha-sep" /> }
          }
        </nav>
      </div>

      <div class="geo-topo__acoes">
        <!-- Busca rápida de telas (Ctrl+K ou /) -->
        <app-busca-telas [menuItems]="menuItems()"></app-busca-telas>

        <geo-icon-button
          [icon]="theme.isDarkMode() ? 'sun' : 'moon'"
          [label]="theme.isDarkMode() ? 'Usar tema claro' : 'Usar tema escuro'"
          tooltipPosition="bottom"
          (pressed)="toggleTheme()"
        ></geo-icon-button>

        <geo-icon-button icon="star" label="Favoritos" tooltipPosition="bottom" (click)="favOp.toggle($event)"></geo-icon-button>

        <div class="geo-topo__notificacoes">
          <geo-icon-button
            icon="bell"
            [label]="rotuloNotificacoes()"
            tooltipPosition="bottom"
            (click)="notificacoes.carregarRecentes(); notifOp.toggle($event)"
          ></geo-icon-button>
          @if (notificacoes.temNaoLidas()) {
            <span class="geo-topo__contador" aria-hidden="true">{{ notificacoes.badge() }}</span>
          }
        </div>

        <button type="button" class="geo-topo__conta" aria-label="Conta e preferências" (click)="op.toggle($event)">
          <span class="geo-topo__avatar" aria-hidden="true">{{ iniciais() }}</span>
        </button>
      </div>
    </header>

    <app-change-password-dialog #changePasswordDialog></app-change-password-dialog>

    <!-- Favorites Popover -->
    <p-popover #favOp styleClass="!p-0 !border-0 !bg-transparent [&_.p-popover-content]:!p-0">
      <div class="flex flex-col w-72 lg:w-80 bg-[var(--geo-surface)] text-[var(--geo-foreground)] border border-[var(--geo-border)] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b border-[var(--geo-border)] bg-[var(--geo-surface-subtle)] flex items-center justify-between">
          <span class="text-sm font-bold text-[var(--geo-foreground)]">Meus Favoritos</span>
          <span class="text-[10px] bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded-full font-bold">
            {{ favs.favoritos().length }} Salvos
          </span>
        </div>

        <div class="max-h-[400px] overflow-y-auto custom-scrollbar">
          @if (favs.favoritos().length > 0) {
            <div class="flex flex-col p-1">
              @for (fav of favs.favoritos(); track fav.id) {
                <div
                  (click)="abrirFavorito(fav.rota); favOp.hide()"
                  class="flex items-center justify-between p-3 rounded-xl hover:bg-[var(--geo-brand-soft)] cursor-pointer transition-all group"
                >
                  <div class="flex items-center gap-3 overflow-hidden">
                    <div class="w-8 h-8 rounded-lg bg-[var(--geo-surface-subtle)] flex items-center justify-center shrink-0 group-hover:bg-[var(--geo-surface)] group-hover:shadow-sm transition-all border border-[var(--geo-border)]">
                      <i [class]="fav.icone || 'pi pi-star'" class="text-[var(--geo-foreground-subtle)] group-hover:text-[var(--geo-brand)] text-sm"></i>
                    </div>
                    <span class="text-xs font-medium text-[var(--geo-foreground-muted)] group-hover:text-[var(--geo-foreground)] truncate">{{ fav.titulo }}</span>
                  </div>
                  <p-button
                    icon="pi pi-trash"
                    [text]="true"
                    severity="danger"
                    (onClick)="$event.stopPropagation(); favs.removerFavorito(fav.id)"
                    styleClass="!w-8 !h-8 !p-0 !opacity-0 group-hover:!opacity-100 transition-opacity"
                  ></p-button>
                </div>
              }
            </div>
          } @else {
            <div class="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div class="w-12 h-12 bg-yellow-500/10 rounded-full flex items-center justify-center mb-4">
                <i class="pi pi-star text-yellow-500 text-2xl"></i>
              </div>
              <span class="text-sm font-medium text-[var(--geo-foreground-muted)]">Nenhum favorito</span>
              <p class="text-[11px] text-[var(--geo-foreground-subtle)] mt-1 leading-relaxed">
                Clique na estrela das páginas para adicioná-las aqui.
              </p>
            </div>
          }

        </div>
      </div>
    </p-popover>

    <!-- Profile Popover -->
    <p-popover #op styleClass="!p-0 !border-0 !bg-transparent [&_.p-popover-content]:!p-0">
      <div class="flex flex-col w-72 bg-[var(--geo-surface)] text-[var(--geo-foreground)] border border-[var(--geo-border)] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <!-- User Info Section -->
        <div class="p-5 border-b border-[var(--geo-border)] bg-[var(--geo-surface-subtle)] flex items-center gap-4">
          <p-avatar icon="pi pi-user" shape="circle" class="!bg-[var(--geo-brand-soft)] !text-[var(--geo-brand)] !w-12 !h-12 !text-lg shadow-sm border border-[var(--geo-border)]"></p-avatar>
          <div class="flex flex-col overflow-hidden">
            <span class="text-sm font-bold text-[var(--geo-foreground)] truncate">{{ auth.currentUser()?.login }}</span>
            <div class="flex items-center gap-1.5 mt-0.5">
              <span class="text-[11px] text-[var(--geo-foreground-muted)] font-medium">Acesso {{ auth.currentUser()?.perfil || 'Padrão' }}</span>
              @if (auth.currentUser()?.tipoUsuario) {
                <span class="text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider bg-[var(--geo-brand-soft)] text-[var(--geo-brand)]">
                  {{ auth.currentUser()?.tipoUsuario === 'CAMPO' ? 'Campo' : 'Admin' }}
                </span>
              }
            </div>
          </div>
        </div>

        <div class="flex flex-col bg-[var(--geo-surface)]">
          <!-- Theme & Personalization Section -->
          <div class="p-4 border-b border-[var(--geo-border)]">
            <span class="text-[10px] font-bold text-[var(--geo-foreground-subtle)] uppercase tracking-widest block mb-3 px-1">Personalização</span>

            <!-- Tema, densidade e movimento -->
            <fieldset class="geo-pref-grupo">
              <legend class="geo-pref-rotulo">Tema</legend>
              <div class="geo-pref-opcoes" role="radiogroup" aria-label="Tema">
                @for (opcao of opcoesTema; track opcao.valor) {
                  <button type="button" role="radio" class="geo-pref-opcao"
                    [attr.aria-checked]="theme.tema() === opcao.valor"
                    (click)="escolherTema(opcao.valor)">
                    <i [class]="'pi ' + opcao.icone" aria-hidden="true"></i>{{ opcao.rotulo }}
                  </button>
                }
              </div>
            </fieldset>

            <fieldset class="geo-pref-grupo">
              <legend class="geo-pref-rotulo">Densidade</legend>
              <div class="geo-pref-opcoes" role="radiogroup" aria-label="Densidade">
                @for (opcao of opcoesDensidade; track opcao.valor) {
                  <button type="button" role="radio" class="geo-pref-opcao"
                    [attr.aria-checked]="theme.densidadePreferida() === opcao.valor"
                    (click)="theme.setDensity(opcao.valor)">
                    {{ opcao.rotulo }}
                  </button>
                }
              </div>
            </fieldset>

            <fieldset class="geo-pref-grupo">
              <legend class="geo-pref-rotulo">Reduzir movimento</legend>
              <div class="geo-pref-opcoes" role="radiogroup" aria-label="Reduzir movimento">
                @for (opcao of opcoesMovimento; track opcao.valor) {
                  <button type="button" role="radio" class="geo-pref-opcao"
                    [attr.aria-checked]="theme.reduzirMovimento() === opcao.valor"
                    (click)="escolherMovimento(opcao.valor)">
                    {{ opcao.rotulo }}
                  </button>
                }
              </div>
            </fieldset>

            <!-- Single-key shortcuts (WCAG 2.1.4) -->
            <div class="flex items-center justify-between p-2 mt-3 bg-[var(--geo-surface-subtle)] rounded-xl border border-[var(--geo-border)]">
              <div class="flex items-center gap-2">
                <i class="pi pi-key text-[var(--geo-foreground-subtle)] text-sm"></i>
                <div class="flex flex-col">
                  <span class="text-xs font-semibold text-[var(--geo-foreground-muted)]">Atalhos de uma tecla</span>
                  <span class="text-[10px] text-[var(--geo-foreground-subtle)] leading-tight">/ busca · F filtros · N novo</span>
                </div>
              </div>
              <p-button
                [icon]="atalhos.enabled() ? 'pi pi-check' : 'pi pi-circle'"
                [text]="true"
                [ariaLabel]="atalhos.enabled() ? 'Desligar atalhos de uma tecla' : 'Ligar atalhos de uma tecla'"
                (onClick)="atalhos.setEnabled(!atalhos.enabled())"
                [styleClass]="atalhos.enabled() ? '!bg-primary-600 !text-white !w-12 !h-7 !rounded-full' : '!bg-slate-200 dark:!bg-slate-700 !text-slate-400 !w-12 !h-7 !rounded-full'"
              ></p-button>
            </div>
          </div>

          <!-- Connectivity Section -->
          <div class="p-4 border-b border-[var(--geo-border)]">
            <div class="flex items-center justify-between mb-3 px-1">
              <span class="text-[10px] font-bold text-[var(--geo-foreground-subtle)] uppercase tracking-widest block">Conectividade</span>
              <span [class]="'text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider ' + (connectivity.isOnline() ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')">
                {{ connectivity.isOnline() ? 'Online' : 'Offline' }}
              </span>
            </div>

            <!-- Mobile Data Sync Toggle -->
            <div class="flex items-center justify-between p-2 mb-2.5 bg-[var(--geo-surface-subtle)] rounded-xl border border-[var(--geo-border)]">
              <div class="flex items-center gap-2">
                <i [class]="connectivity.usarRedesMoveis() ? 'pi pi-wifi text-primary-500' : 'pi pi-mobile text-[var(--geo-foreground-subtle)]'" class="text-sm"></i>
                <div class="flex flex-col">
                  <span class="text-xs font-semibold text-[var(--geo-foreground-muted)]">Usar Redes Móveis</span>
                  <span class="text-[10px] text-[var(--geo-foreground-subtle)] leading-tight">
                    {{ connectivity.usarRedesMoveis() ? 'Sincronizar no 3G/4G' : 'Apenas em rede Wi-Fi' }}
                  </span>
                </div>
              </div>
              <p-button
                [icon]="connectivity.usarRedesMoveis() ? 'pi pi-check' : 'pi pi-circle'"
                [text]="true"
                (onClick)="toggleRedesMoveis()"
                [pTooltip]="connectivity.usarRedesMoveis() ? 'Sincronização em 3G/4G permitida' : 'Bloquear sincronização em 3G/4G'"
                tooltipPosition="left"
                [styleClass]="connectivity.usarRedesMoveis() ? '!bg-primary-600 !text-white !w-12 !h-7 !rounded-full' : '!bg-slate-200 dark:!bg-slate-700 !text-slate-400 !w-12 !h-7 !rounded-full'"
              ></p-button>
            </div>

            <!-- Manual Offline Toggle -->
            <div class="flex items-center justify-between p-2 bg-[var(--geo-surface-subtle)] rounded-xl border border-[var(--geo-border)]">
              <div class="flex items-center gap-2">
                <i [class]="connectivity.forcarOffline() ? 'pi pi-cloud-slash text-amber-500' : 'pi pi-cloud text-[var(--geo-foreground-subtle)]'" class="text-sm"></i>
                <div class="flex flex-col">
                  <span class="text-xs font-semibold text-[var(--geo-foreground-muted)]">Forçar Modo Offline</span>
                  <span class="text-[10px] text-[var(--geo-foreground-subtle)] leading-tight">
                    {{ connectivity.forcarOffline() ? 'Trabalhando offline' : 'Operação automática' }}
                  </span>
                </div>
              </div>
              <p-button
                [icon]="connectivity.forcarOffline() ? 'pi pi-check' : 'pi pi-circle'"
                [text]="true"
                (onClick)="toggleForcarOffline()"
                [pTooltip]="connectivity.forcarOffline() ? 'Desativar modo offline manual' : 'Forçar modo offline no aparelho'"
                tooltipPosition="left"
                [styleClass]="connectivity.forcarOffline() ? '!bg-amber-600 !text-white !w-12 !h-7 !rounded-full' : '!bg-slate-200 dark:!bg-slate-700 !text-slate-400 !w-12 !h-7 !rounded-full'"
              ></p-button>
            </div>
          </div>

          <!-- Quick Actions Section -->
          <div class="p-2">
            <p-button
              label="Meus Favoritos"
              icon="pi pi-star"
              [text]="true"
              (onClick)="openFavoritesFromMenu(op, favOp)"
              styleClass="!w-full !justify-start !text-[var(--geo-foreground-muted)] !text-[11px] !py-2.5 hover:!bg-[var(--geo-surface-muted)] hover:!text-[var(--geo-foreground)] !border-0 transition-all !rounded-xl"
            ></p-button>
            <p-button
              label="Central de Treinamento"
              icon="pi pi-book"
              [text]="true"
              (onClick)="showManuaisDialog.set(true); op.hide()"
              styleClass="!w-full !justify-start !text-[var(--geo-foreground-muted)] !text-[11px] !py-2.5 hover:!bg-[var(--geo-surface-muted)] hover:!text-[var(--geo-foreground)] !border-0 transition-all !rounded-xl"
            ></p-button>
            @if (avaliacao.haPesquisa()) {
              <p-button
                label="Avaliar o GEO"
                icon="pi pi-star"
                [text]="true"
                (onClick)="avaliacao.abrir(); op.hide()"
                styleClass="!w-full !justify-start !text-[var(--geo-foreground-muted)] !text-[11px] !py-2.5 hover:!bg-[var(--geo-surface-muted)] hover:!text-[var(--geo-foreground)] !border-0 transition-all !rounded-xl"
              ></p-button>
            }
            @if (auth.currentUser()?.permissoes?.includes('assistente:conexao:use')) {
              <p-button
                label="Conectar sua IA"
                icon="pi pi-link"
                [text]="true"
                (onClick)="router.navigate(['/bussola/conectar-ia']); op.hide()"
                styleClass="!w-full !justify-start !text-[var(--geo-foreground-muted)] !text-[11px] !py-2.5 hover:!bg-[var(--geo-surface-muted)] hover:!text-[var(--geo-foreground)] !border-0 transition-all !rounded-xl"
              ></p-button>
            }
            <p-button
              label="Alterar Senha"
              icon="pi pi-lock"
              [text]="true"
              (onClick)="showChangePassword(); op.hide()"
              styleClass="!w-full !justify-start !text-[var(--geo-foreground-muted)] !text-[11px] !py-2.5 hover:!bg-[var(--geo-surface-muted)] hover:!text-[var(--geo-foreground)] !border-0 transition-all !rounded-xl"
            ></p-button>
            <p-button
              label="Privacidade e termos"
              icon="pi pi-shield"
              [text]="true"
              (onClick)="router.navigate(['/privacidade']); op.hide()"
              styleClass="!w-full !justify-start !text-[var(--geo-foreground-muted)] !text-[11px] !py-2.5 hover:!bg-[var(--geo-surface-muted)] hover:!text-[var(--geo-foreground)] !border-0 transition-all !rounded-xl"
            ></p-button>
            <div class="h-px bg-[var(--geo-border)] my-2 mx-3"></div>
            <p-button (onClick)="logout.emit()" label="Sair do Sistema" icon="pi pi-power-off" [text]="true" styleClass="!w-full !justify-start !text-red-500 !text-[11px] !py-2.5 hover:!bg-red-500/10 !border-0 font-bold transition-all !rounded-xl"></p-button>
          </div>
        </div>
      </div>
    </p-popover>

    <!-- Notifications Popover -->
    <p-popover #notifOp styleClass="!p-0 !border-0 !bg-transparent [&_.p-popover-content]:!p-0">
      <app-notificacoes-panel (fechar)="notifOp.hide()"></app-notificacoes-panel>
    </p-popover>

    <!-- Dialog Manuais -->
    <p-dialog header="Manuais de Instrução e Treinamento" [(visible)]="showManuaisDialog" [modal]="true" [style]="{ width: '90vw', maxWidth: '680px' }" [draggable]="false" [resizable]="false">
      <div class="flex flex-col gap-4 py-2">
        <p class="text-sm text-[var(--geo-foreground-muted)]">Acesse os guias oficiais e manuais interativos com vídeos tutoriais para capacitação operacional no GEO.</p>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
          
          <!-- Card Central de Treinamento (destaque principal) -->
          <button
            type="button"
            class="col-span-1 md:col-span-2 text-left border border-[var(--geo-border)] rounded-xl bg-[var(--geo-surface)] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all group cursor-pointer hover:shadow-md hover:border-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--geo-focus-ring)]"
            (click)="abrirManual('/manuais')"
          >
            <span class="flex items-center gap-3.5">
              <span class="w-11 h-11 rounded-xl bg-[var(--geo-brand-soft)] text-[var(--geo-brand)] flex items-center justify-center shrink-0 text-lg">
                <i class="pi pi-graduation-cap" aria-hidden="true"></i>
              </span>
              <span class="flex flex-col gap-0.5">
                <span class="text-[10px] font-bold text-[var(--geo-foreground-subtle)] uppercase tracking-wider">Hub unificado · 6 módulos com vídeo</span>
                <span class="font-bold text-sm text-[var(--geo-foreground)] group-hover:text-primary-500 transition-colors">Central de Treinamento</span>
                <span class="text-[11px] text-[var(--geo-foreground-muted)]">Passo a passo por módulo, busca instantânea, fluxos offline e impressão em A4.</span>
              </span>
            </span>
            <span class="text-[10px] font-bold text-primary-500 flex items-center gap-1.5 uppercase tracking-wider shrink-0">
              Acessar Central <i class="pi pi-arrow-right text-[8px] group-hover:translate-x-1 transition-transform" aria-hidden="true"></i>
            </span>
          </button>
          
          <!-- Card Manual Descontos -->
          <div class="border border-[var(--geo-border)] rounded-xl overflow-hidden hover:shadow-md hover:border-primary-400 transition-all group cursor-pointer bg-[var(--geo-surface)]" (click)="abrirManual('/manual-descontos')">
            <div class="h-24 bg-primary-900 flex items-center justify-center relative overflow-hidden">
              <i class="pi pi-file-edit absolute -right-2 -bottom-4 text-6xl text-white/10 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300"></i>
              <div class="flex items-center gap-2 text-primary-100 font-bold tracking-widest uppercase text-xs z-10">
                <i class="pi pi-users text-sm"></i> Depto Pessoal
              </div>
            </div>
            <div class="p-4 flex flex-col gap-2">
              <h4 class="font-bold text-[var(--geo-foreground)] text-sm group-hover:text-primary-500 transition-colors">Descontos em Folha</h4>
              <p class="text-[11px] text-[var(--geo-foreground-muted)] line-clamp-2">Aprenda a lançar avarias, aprovar valores e realizar descontos no holerite.</p>
              <div class="mt-2 text-[10px] font-bold text-primary-500 flex items-center gap-1 uppercase tracking-wider">
                Acessar Guia <i class="pi pi-arrow-right text-[8px] mt-0.5 group-hover:translate-x-1 transition-transform"></i>
              </div>
            </div>
          </div>

          <!-- Card Manual SST -->
          <div class="border border-[var(--geo-border)] rounded-xl overflow-hidden hover:shadow-md hover:border-teal-400 transition-all group cursor-pointer bg-[var(--geo-surface)]" (click)="abrirManual('/manual-sst')">
            <div class="h-24 bg-teal-900 flex items-center justify-center relative overflow-hidden">
              <i class="pi pi-shield absolute -right-2 -bottom-4 text-6xl text-white/10 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300"></i>
              <div class="flex items-center gap-2 text-teal-100 font-bold tracking-widest uppercase text-xs z-10">
                <i class="pi pi-shield text-sm"></i> Seg. Trabalho
              </div>
            </div>
            <div class="p-4 flex flex-col gap-2">
              <h4 class="font-bold text-[var(--geo-foreground)] text-sm group-hover:text-teal-400 transition-colors">Inspeções (SST)</h4>
              <p class="text-[11px] text-[var(--geo-foreground-muted)] line-clamp-2">Veja como analisar formulários de checklist, tratar desvios e planos de ação.</p>
              <div class="mt-2 text-[10px] font-bold text-teal-400 flex items-center gap-1 uppercase tracking-wider">
                Acessar Guia <i class="pi pi-arrow-right text-[8px] mt-0.5 group-hover:translate-x-1 transition-transform"></i>
              </div>
            </div>
          </div>

        </div>
      </div>
    </p-dialog>
  `
})
export class HeaderComponent {
  @ViewChild('changePasswordDialog') changePasswordDialog!: ChangePasswordDialogComponent;
  @ViewChild('favButton') favButton!: any;

  protected auth = inject(AuthService);

  private readonly urlAtual = toSignal(
    inject(Router).events.pipe(
      filter((evento): evento is NavigationEnd => evento instanceof NavigationEnd),
      map((evento) => evento.urlAfterRedirects),
      startWith(typeof location !== 'undefined' ? location.pathname : '')
    ),
    { initialValue: '' }
  );

  private readonly trilhaDaPagina = inject(GeoTrilhaDaPagina);

  /** Trilha "Grupo › Tela" do menu, completada pelo que a página informa (registro aberto, recorte). */
  protected readonly trilha = computed(() =>
    montarTrilha(this.menuItems(), this.urlAtual() ?? '', this.trilhaDaPagina.trechos())
  );

  protected readonly iniciais = computed(() => {
    const usuario = this.auth.currentUser();
    const base = (usuario?.nome || usuario?.login || '').trim();
    const partes = base.split(/\s+/).filter(Boolean);
    const letras = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : base.slice(0, 2);
    return letras.toUpperCase() || '?';
  });

  protected readonly rotuloNotificacoes = computed(() => {
    if (!this.notificacoes.temNaoLidas()) return 'Notificações';
    const total = this.notificacoes.badge();
    return `Notificações, ${total} ${total === '1' ? 'nova' : 'novas'}`;
  });
  protected connectivity = inject(ConnectivityService);
  protected favs = inject(FavoritosService);
  protected theme = inject(ThemeService);
  protected readonly atalhos = inject(GeoShortcutsPreference);
  protected usuariosService = inject(UsuariosService);
  protected messageService = inject(MessageService);
  protected notificacoes = inject(NotificacoesStore);
  protected router = inject(Router);
  protected readonly avaliacao = inject(AvaliacaoConviteService);
  private readonly viewState = inject(ViewStateStore);

  /** Navegação intencional: o favorito abre a tela limpa. */
  protected abrirFavorito(rota: string): void {
    this.viewState.clearRoute(rota);
    this.router.navigate([rota]);
  }

  isMobile = input<boolean>(false);
  /** O menu já filtrado por permissão — a busca rápida se alimenta dele. */
  menuItems = input<MenuItem[]>([]);
  toggleMenu = output<void>();
  logout = output<void>();

  showManuaisDialog = signal(false);

  readonly opcoesTema: { valor: GeoTema; rotulo: string; icone: string }[] = [
    { valor: 'claro', rotulo: 'Claro', icone: 'pi-sun' },
    { valor: 'escuro', rotulo: 'Escuro', icone: 'pi-moon' },
    { valor: 'sistema', rotulo: 'Sistema', icone: 'pi-desktop' }
  ];
  readonly opcoesDensidade: { valor: GeoDensidadePreferida; rotulo: string }[] = [
    { valor: 'auto', rotulo: 'Automática' },
    { valor: 'compact', rotulo: 'Compacta' },
    { valor: 'comfortable', rotulo: 'Confortável' }
  ];
  readonly opcoesMovimento: { valor: GeoReduzirMovimento; rotulo: string }[] = [
    { valor: 'automatico', rotulo: 'Automático' },
    { valor: 'ligado', rotulo: 'Ligado' }
  ];

  showChangePassword() {
    this.changePasswordDialog.show();
  }

  toggleTheme() {
    const newMode = !this.theme.isDarkMode();
    this.theme.setDarkMode(newMode);
    this.syncPreferencias();
  }

  escolherTema(tema: GeoTema) {
    this.theme.setTema(tema);
    this.syncPreferencias();
  }

  escolherMovimento(valor: GeoReduzirMovimento) {
    this.theme.setReduzirMovimento(valor);
    this.syncPreferencias();
  }

  toggleRedesMoveis() {
    this.connectivity.setUsarRedesMoveis(!this.connectivity.usarRedesMoveis());
  }

  toggleForcarOffline() {
    this.connectivity.setForcarOffline(!this.connectivity.forcarOffline());
  }

  private syncPreferencias() {
    const themeData = {
      tema: (this.theme.isDarkMode() ? 'dark' : 'light') as 'light' | 'dark',
      corPrimaria: this.theme.primaryColor(),
      animacoesAtivadas: this.theme.reduzirMovimento() !== 'ligado'
    };

    // Atualiza a sessão e localStorage localmente de forma imediata
    this.auth.updateUserSession(themeData);

    this.usuariosService.atualizarPreferencias(themeData).subscribe({
      next: () => {},
      error: () => {
        // As preferências permanecem no dispositivo mesmo se o servidor estiver offline
      }
    });
  }

  openFavoritesFromMenu(op: any, favOp: any) {
    op.hide();
    
    setTimeout(() => {
      try {
        const btnNative = this.favButton.el?.nativeElement || this.favButton.nativeElement;
        const buttonElement = btnNative?.querySelector('button') || btnNative;
        
        if (buttonElement) {
          const rect = buttonElement.getBoundingClientRect();
          const fakeClick = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: rect.left + (rect.width / 2),
            clientY: rect.top + (rect.height / 2)
          });
          buttonElement.dispatchEvent(fakeClick);
        } else {
          favOp.show(new Event('click'));
        }
      } catch (e) {
        favOp.show(new Event('click'));
      }
    }, 250);
  }

  abrirManual(rota: string) {
    this.showManuaisDialog.set(false);
    const url = this.router.serializeUrl(this.router.createUrlTree([rota]));
    window.open(url, '_blank');
  }
}

/** Caminho do menu até o item cuja rota mais se aproxima da URL atual. */
function caminhoDoMenu(itens: MenuItem[], url: string): { rotulos: string[]; alvo: string } | undefined {
  const caminho = url.split('?')[0].split('#')[0];
  let melhor: { rotulos: string[]; alvo: string } | undefined;
  const visitar = (lista: MenuItem[], acima: string[]) => {
    for (const item of lista) {
      if (item.visible === false) continue;
      const rotulos = [...acima, item.label ?? ''];
      const link = Array.isArray(item.routerLink) ? item.routerLink.join('/') : item.routerLink;
      if (typeof link === 'string') {
        const alvo = link.split('?')[0];
        const casa = caminho === alvo || caminho.startsWith(alvo + '/');
        if (casa && (!melhor || alvo.length > melhor.alvo.length)) melhor = { rotulos: rotulos.filter(Boolean), alvo };
      }
      if (item.items?.length) visitar(item.items, rotulos);
    }
  };
  visitar(itens, []);
  return melhor;
}

/** Rótulos do menu até a tela atual. */
export function trilhaDoMenu(itens: MenuItem[], url: string): string[] {
  return caminhoDoMenu(itens, url)?.rotulos ?? [];
}

const rotaComoTexto = (rota: GeoTrechoDaTrilha['route']): string | undefined =>
  rota == null ? undefined : (Array.isArray(rota) ? rota.join('/') : String(rota)).split('?')[0];

/**
 * Trilha única do app. Na tela do próprio menu, é o caminho do menu. Numa tela mais funda
 * (ficha, formulário), o último trecho do menu vira link de volta, com o recorte que a página
 * informou, e o último trecho da página (o registro aberto) fecha a trilha. Fora do menu, vale a
 * trilha da página.
 */
export function montarTrilha(
  itens: MenuItem[],
  url: string,
  pagina: readonly GeoTrechoDaTrilha[]
): GeoTrechoDaTrilha[] {
  const menu = caminhoDoMenu(itens, url);
  if (!menu) return [...pagina];
  const caminho = url.split('?')[0].split('#')[0];
  const trechos: GeoTrechoDaTrilha[] = menu.rotulos.map((label) => ({ label }));
  const ultimaDaPagina = pagina.at(-1);
  if (caminho === menu.alvo || !ultimaDaPagina || ultimaDaPagina.label === menu.rotulos.at(-1)) return trechos;

  const origem = pagina.find((t) => rotaComoTexto(t.route) === menu.alvo) ?? pagina.at(-2);
  const queryParams = origem?.route ? origem.queryParams ?? null : null;
  trechos[trechos.length - 1] = { label: menu.rotulos.at(-1) ?? '', route: menu.alvo, queryParams };
  trechos.push({ label: ultimaDaPagina.label });
  return trechos;
}
